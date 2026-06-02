import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function parseHHMM(t: string | null): number | null {
  if (!t) return null
  const m = t.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i)
  if (!m) return null
  let h = parseInt(m[1]), min = parseInt(m[2])
  const period = m[3]?.toUpperCase()
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return h * 60 + min
}

function calcHours(open: string | null, close: string | null): number {
  const o = parseHHMM(open), c = parseHHMM(close)
  if (o === null || c === null) return 0
  let diff = c - o
  if (diff < 0) diff += 24 * 60
  return Math.round((diff / 60) * 100) / 100
}

function r2(n: number) { return Math.round(n * 100) / 100 }

interface RateCard {
  package_4hr_kms: number; package_4hr_hrs: number; package_4hr_rate: number
  package_8hr_kms: number; package_8hr_hrs: number; package_8hr_rate: number
  extra_km_rate: number; extra_hr_rate: number
  outstation_rate_per_km: number; outstation_min_kms_per_day: number
  local_bata: number; outstation_bata_per_day: number
}

function calcLocal(kms: number, hrs: number, rate: RateCard) {
  const use4 = hrs <= rate.package_4hr_hrs && kms <= rate.package_4hr_kms
  const pkgKms  = use4 ? rate.package_4hr_kms  : rate.package_8hr_kms
  const pkgHrs  = use4 ? rate.package_4hr_hrs  : rate.package_8hr_hrs
  const pkgRate = use4 ? rate.package_4hr_rate : rate.package_8hr_rate
  const pkgType = use4 ? '4HR' : '8HR'
  const extKms = Math.max(0, kms - pkgKms)
  const extHrs = Math.max(0, hrs - pkgHrs)
  const extKmAmt = r2(extKms * rate.extra_km_rate)
  const extHrAmt = r2(extHrs * rate.extra_hr_rate)
  return { pkgType, pkgKms, pkgHrs, pkgRate, extKms, extKmAmt, extHrs, extHrAmt, hire: r2(pkgRate + extKmAmt + extHrAmt) }
}

function calcOutstation(kms: number, days: number, rate: RateCard) {
  const billKms = Math.max(kms, rate.outstation_min_kms_per_day * days)
  return {
    pkgType: 'OUTSTATION', pkgKms: rate.outstation_min_kms_per_day * days,
    pkgHrs: 0, pkgRate: rate.outstation_rate_per_km,
    extKms: 0, extKmAmt: 0, extHrs: 0, extHrAmt: 0,
    hire: r2(billKms * rate.outstation_rate_per_km),
  }
}

function calcGST(hire: number, isInterState: boolean, reverseCharge: boolean) {
  if (reverseCharge) return { taxable: 0, cgst: 0, sgst: 0, igst: 0, cgstRate: 0, sgstRate: 0, igstRate: 0 }
  const taxable = r2(hire)
  if (isInterState) return { taxable, cgst: 0, sgst: 0, igst: r2(taxable * 0.05), cgstRate: 0, sgstRate: 0, igstRate: 5 }
  return { taxable, cgst: r2(taxable * 0.025), sgst: r2(taxable * 0.025), igst: 0, cgstRate: 2.5, sgstRate: 2.5, igstRate: 0 }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: invoiceId } = await params
  const { line_item_id } = await request.json() as { line_item_id: string }
  const supabase = createAdminClient()

  const [{ data: invoice }, { data: li }] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', invoiceId).single(),
    supabase.from('invoice_line_items').select('*').eq('id', line_item_id).single(),
  ])
  if (!invoice || !li) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const reverseCharge = invoice.reverse_charge ?? false
  const isInterState  = (invoice.igst_amount ?? 0) > 0

  const [{ data: booking }, { data: sheet }, { data: defaultRates }, { data: clientRates }, { data: companyBataRates }] = await Promise.all([
    supabase.from('bookings').select('*, driver:drivers!driver_id(vehicle_name, vehicle_number)').eq('id', li.booking_id).single(),
    supabase.from('trip_sheets').select('*').eq('id', li.trip_sheet_id).single(),
    supabase.from('rate_cards').select('*'),
    supabase.from('client_rate_cards').select('*').eq('company_id', invoice.company_id).eq('is_active', true).lte('effective_from', invoice.period_from).order('effective_from', { ascending: true }),
    supabase.from('company_bata_rates').select('vehicle_name, trip_type, rate_per_bata').eq('company_id', invoice.company_id).not('rate_per_bata', 'is', null),
  ])

  const defaultRateMap: Record<string, RateCard> = {}
  for (const r of defaultRates ?? []) defaultRateMap[r.vehicle_type.toUpperCase()] = r
  const clientRateMap: Record<string, RateCard> = {}
  for (const r of clientRates ?? []) clientRateMap[r.vehicle_type.toUpperCase()] = { ...defaultRateMap[r.vehicle_type.toUpperCase()], ...r }
  const tdsPercent = (clientRates ?? [])[0]?.tds_percent ?? 0

  const companyBataMap: Record<string, number> = {}
  for (const r of companyBataRates ?? []) {
    companyBataMap[`${(r.vehicle_name ?? '').toUpperCase()}:${r.trip_type ?? 'all'}`] = Number(r.rate_per_bata)
  }

  const driver = booking?.driver as { vehicle_name?: string; vehicle_number?: string } | null
  const driverVehicleName = (driver?.vehicle_name ?? '').toUpperCase()
  const vType = driverVehicleName || (booking?.vehicle_type ?? '').toUpperCase()
  const rate: RateCard = clientRateMap[vType] ?? defaultRateMap[vType] ?? {
    package_4hr_kms: 40, package_4hr_hrs: 4, package_4hr_rate: 900,
    package_8hr_kms: 80, package_8hr_hrs: 8, package_8hr_rate: 1900,
    extra_km_rate: 14, extra_hr_rate: 250,
    outstation_rate_per_km: 14, outstation_min_kms_per_day: 300,
    local_bata: 300, outstation_bata_per_day: 450,
  }

  const openKm  = Number(sheet?.client_opening_km  ?? sheet?.opening_km  ?? 0)
  const closeKm = Number(sheet?.client_closing_km  ?? sheet?.closing_km  ?? 0)
  const actualKms = closeKm > openKm ? closeKm - openKm : 0
  const actualHrs = calcHours(
    (sheet?.client_opening_time  ?? sheet?.manual_opening_time)  as string | null,
    (sheet?.client_closing_time  ?? sheet?.manual_closing_time) as string | null,
  )
  const days = booking?.total_days ?? 1
  const displayHrs = booking?.trip_type === 'outstation' ? days : actualHrs
  const toll    = Number(sheet?.client_toll_amount    ?? sheet?.toll_amount    ?? 0)
  const parking = Number(sheet?.client_parking_amount ?? sheet?.parking_amount ?? 0)
  const permit  = Number(sheet?.client_permit_amount  ?? sheet?.permit_amount  ?? 0)
  const bataCount = Number(sheet?.bata_client ?? sheet?.bata_driver ?? 0)

  const cbKey    = `${driverVehicleName}:${booking?.trip_type ?? 'local'}`
  const cbKeyAll = `${driverVehicleName}:all`

  let calc
  if (booking?.trip_type === 'outstation') {
    const bataRate = companyBataMap[cbKey] ?? companyBataMap[cbKeyAll] ?? rate.outstation_bata_per_day ?? 450
    const { hire } = calcOutstation(actualKms, days, rate)
    calc = { ...calcOutstation(actualKms, days, rate), bata: r2(bataRate * bataCount) }
    void hire
  } else {
    const bataRate = companyBataMap[cbKey] ?? companyBataMap[cbKeyAll] ?? rate.local_bata ?? 300
    calc = { ...calcLocal(actualKms, actualHrs, rate), bata: r2(bataCount * bataRate) }
  }

  const gst = calcGST(calc.hire, isInterState, reverseCharge)
  const lineTotal = r2(calc.hire + gst.cgst + gst.sgst + gst.igst + toll + parking + permit + calc.bata)

  await supabase.from('invoice_line_items').update({
    actual_kms:      actualKms,
    actual_hrs:      displayHrs,
    package_type:    calc.pkgType,
    package_kms:     calc.pkgKms,
    package_rate:    calc.pkgRate,
    extra_kms:       calc.extKms,
    extra_km_rate:   rate.extra_km_rate,
    extra_km_amount: calc.extKmAmt,
    extra_hrs:       calc.extHrs,
    extra_hr_rate:   rate.extra_hr_rate,
    extra_hr_amount: calc.extHrAmt,
    hire_charges:    calc.hire,
    toll_amount:     toll,
    parking_amount:  parking,
    permit_amount:   permit,
    bata_amount:     calc.bata,
    gst_taxable:     gst.taxable,
    cgst_rate:       gst.cgstRate,
    sgst_rate:       gst.sgstRate,
    igst_rate:       gst.igstRate,
    cgst_amount:     gst.cgst,
    sgst_amount:     gst.sgst,
    igst_amount:     gst.igst,
    line_total:      lineTotal,
  }).eq('id', line_item_id)

  // Resum all line items and update invoice totals
  const { data: allItems } = await supabase
    .from('invoice_line_items')
    .select('hire_charges, cgst_amount, sgst_amount, igst_amount, toll_amount, parking_amount, permit_amount, bata_amount')
    .eq('invoice_id', invoiceId)

  const sumHire  = (allItems ?? []).reduce((s, i) => s + Number(i.hire_charges  ?? 0), 0)
  const sumCgst  = (allItems ?? []).reduce((s, i) => s + Number(i.cgst_amount   ?? 0), 0)
  const sumSgst  = (allItems ?? []).reduce((s, i) => s + Number(i.sgst_amount   ?? 0), 0)
  const sumIgst  = (allItems ?? []).reduce((s, i) => s + Number(i.igst_amount   ?? 0), 0)
  const sumExtra = (allItems ?? []).reduce((s, i) => s + Number(i.toll_amount ?? 0) + Number(i.parking_amount ?? 0) + Number(i.permit_amount ?? 0) + Number(i.bata_amount ?? 0), 0)

  const grandTotalRaw = Math.round(sumHire + sumExtra + sumCgst + sumSgst + sumIgst)
  const tdsAmount     = r2(grandTotalRaw * tdsPercent / 100)
  const grandTotal    = r2(grandTotalRaw - tdsAmount)
  const amountPaid    = Number(invoice.amount_paid ?? 0)
  const balanceDue    = r2(Math.max(0, grandTotal - amountPaid))

  await supabase.from('invoices').update({
    subtotal:     r2(sumHire),
    cgst_amount:  r2(sumCgst),
    sgst_amount:  r2(sumSgst),
    igst_amount:  r2(sumIgst),
    tds_amount:   tdsAmount,
    grand_total:  grandTotal,
    balance_due:  balanceDue,
  }).eq('id', invoiceId)

  return NextResponse.json({ ok: true })
}
