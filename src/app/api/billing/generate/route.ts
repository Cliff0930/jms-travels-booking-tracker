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

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100
}

interface RateCard {
  package_4hr_kms: number
  package_4hr_hrs: number
  package_4hr_rate: number
  package_8hr_kms: number
  package_8hr_hrs: number
  package_8hr_rate: number
  extra_km_rate: number
  extra_hr_rate: number
  outstation_rate_per_km: number
  outstation_min_kms_per_day: number
  local_bata: number
  outstation_bata_per_day: number
  bill_bata_to_client?: boolean
  tds_percent?: number
}

function calcLocalTrip(actualKms: number, actualHrs: number, rate: RateCard) {
  // Determine package
  const use4hr = actualHrs <= rate.package_4hr_hrs && actualKms <= rate.package_4hr_kms
  const packageKms = use4hr ? rate.package_4hr_kms : rate.package_8hr_kms
  const packageHrs = use4hr ? rate.package_4hr_hrs : rate.package_8hr_hrs
  const packageRate = use4hr ? rate.package_4hr_rate : rate.package_8hr_rate
  const packageType = use4hr ? '4HR' : '8HR'

  const extraKms = Math.max(0, actualKms - packageKms)
  const extraHrs = Math.max(0, actualHrs - packageHrs)
  const extraKmAmount = roundTo2(extraKms * rate.extra_km_rate)
  const extraHrAmount = roundTo2(extraHrs * rate.extra_hr_rate)
  const hireCharges = roundTo2(packageRate + extraKmAmount + extraHrAmount)

  return { packageType, packageKms, packageRate, extraKms, extraKmAmount, extraHrs, extraHrAmount, hireCharges }
}

function calcOutstationTrip(actualKms: number, days: number, rate: RateCard) {
  const billableKms = Math.max(actualKms, rate.outstation_min_kms_per_day * days)
  const hireCharges = roundTo2(billableKms * rate.outstation_rate_per_km)
  const bataAmount = roundTo2(rate.outstation_bata_per_day * days)
  return { packageType: 'OUTSTATION', packageKms: rate.outstation_min_kms_per_day * days, packageRate: rate.outstation_rate_per_km, extraKms: 0, extraKmAmount: 0, extraHrs: 0, extraHrAmount: 0, hireCharges, bataAmount }
}

function calcGST(hireCharges: number, isInterState: boolean) {
  const taxable = roundTo2(hireCharges)
  if (isInterState) {
    return { gstTaxable: taxable, cgstAmount: 0, sgstAmount: 0, igstAmount: roundTo2(taxable * 0.05), cgstRate: 0, sgstRate: 0, igstRate: 5 }
  }
  const cgst = roundTo2(taxable * 0.025)
  const sgst = roundTo2(taxable * 0.025)
  return { gstTaxable: taxable, cgstAmount: cgst, sgstAmount: sgst, igstAmount: 0, cgstRate: 2.5, sgstRate: 2.5, igstRate: 0 }
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const { company_id, period_from, period_to, is_inter_state = false, reverse_charge = false } = await request.json() as {
    company_id: string; period_from: string; period_to: string; is_inter_state?: boolean; reverse_charge?: boolean
  }

  if (!company_id || !period_from || !period_to) {
    return NextResponse.json({ error: 'company_id, period_from, period_to required' }, { status: 400 })
  }

  // Fetch default rate cards
  const { data: defaultRates } = await supabase.from('rate_cards').select('*')
  const defaultRateMap: Record<string, RateCard> = {}
  for (const r of defaultRates ?? []) defaultRateMap[r.vehicle_type.toUpperCase()] = r

  // Fetch client-specific rate overrides effective at the start of the billing period
  // Order ascending so the most recent effective rate wins when building the map
  const { data: clientRates } = await supabase
    .from('client_rate_cards')
    .select('*')
    .eq('company_id', company_id)
    .eq('is_active', true)
    .lte('effective_from', period_from)
    .order('effective_from', { ascending: true })

  const clientRateMap: Record<string, RateCard> = {}
  for (const r of clientRates ?? []) clientRateMap[r.vehicle_type.toUpperCase()] = { ...defaultRateMap[r.vehicle_type.toUpperCase()], ...r }

  // Get TDS percent from client rate card (use first found or 0)
  const tdsPercent = (clientRates ?? [])[0]?.tds_percent ?? 0

  // Fetch company bata rates (what we charge the company per bata)
  const { data: companyBataRates } = await supabase
    .from('company_bata_rates')
    .select('vehicle_name, trip_type, rate_per_bata')
    .eq('company_id', company_id)
    .not('rate_per_bata', 'is', null)
  const companyBataMap: Record<string, number> = {}
  for (const r of companyBataRates ?? []) {
    const key = `${(r.vehicle_name ?? '').toUpperCase()}:${r.trip_type ?? 'all'}`
    companyBataMap[key] = Number(r.rate_per_bata)
  }

  // Fetch completed bookings in period for this company
  const { data: bookings, error: bookingsErr } = await supabase
    .from('bookings')
    .select(`
      id, booking_ref, pickup_date, pickup_location, drop_location, trip_type, total_days,
      vehicle_type, guest_name,
      driver:drivers!driver_id(vehicle_name, vehicle_number),
      trip_sheets(id, tripsheet_number, opening_km, closing_km, manual_opening_time, manual_closing_time,
        client_opening_km, client_closing_km, client_opening_time, client_closing_time,
        toll_amount, parking_amount, permit_amount, bata_driver, bata_client)
    `)
    .eq('company_id', company_id)
    .eq('status', 'completed')
    .gte('pickup_date', period_from)
    .lte('pickup_date', period_to)
    .order('pickup_date', { ascending: true })

  if (bookingsErr) return NextResponse.json({ error: bookingsErr.message }, { status: 500 })

  const lineItems = []
  let totalSubtotal = 0, totalExtras = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0

  for (const b of bookings ?? []) {
    const sheets = (b.trip_sheets ?? []) as Array<Record<string, unknown>>
    const sheet = sheets[0] // use first sheet per booking
    // Use driver's vehicle_name (specific model) for rate lookup, not booking vehicle_type (category)
    const driverVehicleName = ((b.driver as { vehicle_name?: string; vehicle_number?: string } | null)?.vehicle_name ?? '').toUpperCase()
    const vType = driverVehicleName || (b.vehicle_type ?? '').toUpperCase()
    const rate: RateCard = clientRateMap[vType] ?? defaultRateMap[vType] ?? {
      package_4hr_kms: 40, package_4hr_hrs: 4, package_4hr_rate: 900,
      package_8hr_kms: 80, package_8hr_hrs: 8, package_8hr_rate: 1900,
      extra_km_rate: 14, extra_hr_rate: 250,
      outstation_rate_per_km: 14, outstation_min_kms_per_day: 300,
      local_bata: 300, outstation_bata_per_day: 450,
    }

    // Use client-adjusted KM/time for invoicing; fall back to actual if not set
    const openKm  = Number(sheet?.client_opening_km  ?? sheet?.opening_km  ?? 0)
    const closeKm = Number(sheet?.client_closing_km  ?? sheet?.closing_km  ?? 0)
    const actualKms = closeKm > openKm ? closeKm - openKm : 0
    const actualHrs = calcHours(
      (sheet?.client_opening_time  ?? sheet?.manual_opening_time)  as string | null,
      (sheet?.client_closing_time  ?? sheet?.manual_closing_time) as string | null
    )
    // For outstation, store total_days in actual_hrs (hrs unused in billing; PDF uses this to show "X Day/s")
    const displayHrs = b.trip_type === 'outstation' ? (b.total_days ?? 1) : actualHrs
    const toll = Number(sheet?.toll_amount ?? 0)
    const parking = Number(sheet?.parking_amount ?? 0)
    const permit = Number(sheet?.permit_amount ?? 0)
    // Use bata_client for invoicing (client threshold: open<06:00, close>22:00)
    // Fall back to bata_driver for older records that don't have bata_client yet
    const bataClientCount = Number(sheet?.bata_client ?? sheet?.bata_driver ?? 0)
    const days = b.total_days ?? 1

    // Company bata rate (what we charge the company) — look up by vehicle+trip_type, fall back to vehicle+all, then rate card default
    const cbKey  = `${driverVehicleName}:${b.trip_type ?? 'local'}`
    const cbKeyAll = `${driverVehicleName}:all`
    let calc
    if (b.trip_type === 'outstation') {
      const outstationBataRate = companyBataMap[cbKey] ?? companyBataMap[cbKeyAll] ?? rate.outstation_bata_per_day ?? 450
      const { bataAmount: _b, ...outstationCalc } = calcOutstationTrip(actualKms, days, rate)
      calc = { ...outstationCalc, bataAmount: roundTo2(outstationBataRate * bataClientCount) }
    } else {
      const localBataRate = companyBataMap[cbKey] ?? companyBataMap[cbKeyAll] ?? rate.local_bata ?? 300
      const { bataAmount: _b, ...localCalc } = { bataAmount: 0, ...calcLocalTrip(actualKms, actualHrs, rate) }
      calc = { ...localCalc, bataAmount: roundTo2(bataClientCount * localBataRate) }
    }

    const bataForInvoice = calc.bataAmount

    // RCM: no GST on invoice — client pays directly to government
    const gstResult = reverse_charge
      ? { gstTaxable: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, cgstRate: 0, sgstRate: 0, igstRate: 0 }
      : calcGST(calc.hireCharges, is_inter_state)
    const { gstTaxable, cgstAmount, sgstAmount, igstAmount, cgstRate, sgstRate, igstRate } = gstResult

    const lineTotal = roundTo2(calc.hireCharges + cgstAmount + sgstAmount + igstAmount + toll + parking + permit + bataForInvoice)

    totalSubtotal += calc.hireCharges
    totalExtras  += toll + parking + permit + bataForInvoice
    totalCgst += cgstAmount
    totalSgst += sgstAmount
    totalIgst += igstAmount

    lineItems.push({
      booking_id: b.id,
      trip_sheet_id: (sheet?.id as string | null) ?? null,
      trip_date: b.pickup_date,
      booking_ref: b.booking_ref,
      // tripsheet_number is NOT stored in invoice_line_items — fetched live from trip_sheets in the detail route
      vehicle_type: driverVehicleName || b.vehicle_type || '',
      vehicle_number: ((b.driver as { vehicle_name?: string; vehicle_number?: string } | null)?.vehicle_number) ?? null,
      guest_name: b.guest_name,
      pickup_location: b.pickup_location,
      drop_location: b.drop_location,
      trip_type: b.trip_type,
      package_type: calc.packageType,
      actual_kms: actualKms,
      actual_hrs: displayHrs,
      package_kms: calc.packageKms,
      package_rate: calc.packageRate,
      extra_kms: calc.extraKms,
      extra_km_rate: rate.extra_km_rate,
      extra_km_amount: calc.extraKmAmount,
      extra_hrs: calc.extraHrs,
      extra_hr_rate: rate.extra_hr_rate,
      extra_hr_amount: calc.extraHrAmount,
      hire_charges: calc.hireCharges,
      toll_amount: toll,
      parking_amount: parking,
      permit_amount: permit,
      bata_amount: calc.bataAmount,
      bill_bata: true,
      gst_taxable: gstTaxable,
      cgst_rate: cgstRate,
      sgst_rate: sgstRate,
      igst_rate: igstRate,
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      igst_amount: igstAmount,
      line_total: lineTotal,
    })
  }

  // Grand total = (hire + extras + GST) rounded to nearest whole rupee
  const grandTotal = Math.round(totalSubtotal + totalExtras + totalCgst + totalSgst + totalIgst)
  const tdsAmount = roundTo2(grandTotal * tdsPercent / 100)

  return NextResponse.json({
    company_id,
    period_from,
    period_to,
    is_inter_state,
    reverse_charge,
    tds_percent: tdsPercent,
    line_items: lineItems,
    subtotal: roundTo2(totalSubtotal),
    cgst_amount: roundTo2(totalCgst),
    sgst_amount: roundTo2(totalSgst),
    igst_amount: roundTo2(totalIgst),
    tds_amount: tdsAmount,
    grand_total: roundTo2(grandTotal - tdsAmount),
    trip_count: lineItems.length,
  })
}
