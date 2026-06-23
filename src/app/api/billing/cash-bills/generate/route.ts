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
function calcMinutes(open: string | null, close: string | null): number {
  const o = parseHHMM(open), c = parseHHMM(close)
  if (o === null || c === null) return 0
  let diff = c - o; if (diff < 0) diff += 24 * 60; return diff
}
function calcHours(open: string | null, close: string | null): number {
  return Math.round((calcMinutes(open, close) / 60) * 100) / 100
}
function roundTo2(n: number): number { return Math.round(n * 100) / 100 }
function roundExtraHrsClient(extraMins: number): number {
  if (extraMins <= 0) return 0
  const full = Math.floor(extraMins / 60)
  return (extraMins % 60) > 20 ? full + 1 : full
}

interface RateCard {
  package_4hr_kms: number; package_4hr_hrs: number; package_4hr_rate: number
  package_airport_rate: number
  package_8hr_kms: number; package_8hr_hrs: number; package_8hr_rate: number
  extra_km_rate: number; extra_hr_rate: number
  outstation_rate_per_km: number; outstation_min_kms_per_day: number
  local_bata: number; outstation_bata_per_day: number
}

const DEFAULT_RATE: RateCard = {
  package_4hr_kms: 40, package_4hr_hrs: 4, package_4hr_rate: 900,
  package_airport_rate: 0,
  package_8hr_kms: 80, package_8hr_hrs: 8, package_8hr_rate: 1900,
  extra_km_rate: 14, extra_hr_rate: 250,
  outstation_rate_per_km: 14, outstation_min_kms_per_day: 300,
  local_bata: 300, outstation_bata_per_day: 450,
}

function calcLocalTrip(actualKms: number, actualMinutes: number, rate: RateCard) {
  const pkg4Mins = rate.package_4hr_hrs * 60
  const extraMinsOver4 = Math.max(0, actualMinutes - pkg4Mins)
  const use4hr = actualKms <= rate.package_4hr_kms && extraMinsOver4 <= 105
  const packageKms  = use4hr ? rate.package_4hr_kms  : rate.package_8hr_kms
  const packageHrs  = use4hr ? rate.package_4hr_hrs  : rate.package_8hr_hrs
  const packageRate = use4hr ? rate.package_4hr_rate : rate.package_8hr_rate
  const packageType = use4hr ? '4HR' : '8HR'
  const pkgMins = packageHrs * 60
  const extraMins = Math.max(0, actualMinutes - pkgMins)
  const extraKms = Math.max(0, actualKms - packageKms)
  const extraHrs = roundExtraHrsClient(extraMins)
  const extraKmAmount = roundTo2(extraKms * rate.extra_km_rate)
  const extraHrAmount = roundTo2(extraHrs * rate.extra_hr_rate)
  const hireCharges = roundTo2(packageRate + extraKmAmount + extraHrAmount)
  return { packageType, packageKms, packageRate, extraKms, extraKmAmount, extraHrs, extraHrAmount, hireCharges }
}

function calcAirportTrip(actualKms: number, actualMinutes: number, rate: RateCard) {
  const AIRPORT_KMS = 80, AIRPORT_HRS = 4
  const pkgMins = AIRPORT_HRS * 60
  const extraMins = Math.max(0, actualMinutes - pkgMins)
  const extraKms = Math.max(0, actualKms - AIRPORT_KMS)
  const extraHrs = roundExtraHrsClient(extraMins)
  const extraKmAmount = roundTo2(extraKms * rate.extra_km_rate)
  const extraHrAmount = roundTo2(extraHrs * rate.extra_hr_rate)
  const hireCharges = roundTo2((rate.package_airport_rate ?? 0) + extraKmAmount + extraHrAmount)
  return { packageType: 'AIRPORT', packageKms: AIRPORT_KMS, packageRate: rate.package_airport_rate ?? 0, extraKms, extraKmAmount, extraHrs, extraHrAmount, hireCharges }
}

function calcOutstationTrip(actualKms: number, days: number, rate: RateCard) {
  const billableKms = Math.max(actualKms, rate.outstation_min_kms_per_day * days)
  const hireCharges = roundTo2(billableKms * rate.outstation_rate_per_km)
  return { packageType: 'OUTSTATION', packageKms: rate.outstation_min_kms_per_day * days, packageRate: rate.outstation_rate_per_km, extraKms: 0, extraKmAmount: 0, extraHrs: 0, extraHrAmount: 0, hireCharges }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const client_id  = searchParams.get('client_id')
  const period_from = searchParams.get('period_from')
  const period_to   = searchParams.get('period_to')

  if (!period_from || !period_to) {
    return NextResponse.json({ error: 'period_from, period_to required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Default rate cards
  const { data: defaultRates } = await supabase.from('rate_cards').select('*')
  const defaultRateMap: Record<string, RateCard> = {}
  for (const r of defaultRates ?? []) defaultRateMap[r.vehicle_type.toUpperCase()] = r

  // Find booking IDs already in any cash_bill
  const billedBookingIds = new Set<string>()
  const { data: existingBills } = await supabase.from('cash_bills').select('id').not('status', 'eq', 'cancelled')
  if (existingBills && existingBills.length > 0) {
    const { data: billedItems } = await supabase
      .from('cash_bill_line_items').select('booking_id')
      .in('cash_bill_id', existingBills.map(b => b.id))
    for (const item of billedItems ?? []) {
      if (item.booking_id) billedBookingIds.add(item.booking_id)
    }
  }

  // Fetch personal completed bookings in period
  const bookingSelect = `
    id, booking_ref, pickup_date, pickup_location, drop_location, trip_type, total_days,
    vehicle_type, guest_name, guest_client_id,
    driver:drivers!driver_id(vehicle_name, vehicle_number),
    trip_sheets(id, tripsheet_number, opening_km, closing_km, manual_opening_time, manual_closing_time,
      client_opening_km, client_closing_km, client_opening_time, client_closing_time,
      toll_amount, parking_amount, permit_amount, bata_driver, bata_client,
      client_toll_amount, client_parking_amount, client_permit_amount)`

  let q = supabase.from('bookings').select(bookingSelect)
    .eq('booking_type', 'personal').eq('status', 'completed')
    .neq('exclude_from_billing', true)
    .gte('pickup_date', period_from).lte('pickup_date', period_to)
    .order('pickup_date', { ascending: true })
  if (client_id) q = q.eq('guest_client_id', client_id)

  const { data: bookings, error: bookingsErr } = await q
  if (bookingsErr) return NextResponse.json({ error: bookingsErr.message }, { status: 500 })

  // Older missed bookings
  let oldQ = supabase.from('bookings').select(bookingSelect)
    .eq('booking_type', 'personal').eq('status', 'completed')
    .neq('exclude_from_billing', true)
    .lt('pickup_date', period_from).order('pickup_date', { ascending: true })
  if (client_id) oldQ = oldQ.eq('guest_client_id', client_id)
  const { data: olderBookings } = await oldQ

  const filteredBookings = (bookings ?? []).filter(b => !billedBookingIds.has(b.id))
  const missedBookings   = (olderBookings ?? []).filter(b => !billedBookingIds.has(b.id))

  function calcBooking(b: Record<string, unknown>) {
    const sheets = (b.trip_sheets ?? []) as Array<Record<string, unknown>>
    const sheet = sheets[0]
    const driverVehicleName = ((b.driver as { vehicle_name?: string; vehicle_number?: string } | null)?.vehicle_name ?? '').toUpperCase()
    const vType = driverVehicleName || (b.vehicle_type as string ?? '').toUpperCase()
    const rate = defaultRateMap[vType] ?? DEFAULT_RATE
    const openKm  = Number(sheet?.client_opening_km  ?? sheet?.opening_km  ?? 0)
    const closeKm = Number(sheet?.client_closing_km  ?? sheet?.closing_km  ?? 0)
    const actualKms = closeKm > openKm ? closeKm - openKm : 0
    const actualHrs = calcHours(
      (sheet?.client_opening_time ?? sheet?.manual_opening_time) as string | null,
      (sheet?.client_closing_time ?? sheet?.manual_closing_time) as string | null
    )
    const actualMinutes = calcMinutes(
      (sheet?.client_opening_time ?? sheet?.manual_opening_time) as string | null,
      (sheet?.client_closing_time ?? sheet?.manual_closing_time) as string | null
    )
    const displayHrs = b.trip_type === 'outstation' ? (b.total_days as number ?? 1) : actualHrs
    const toll    = Number(sheet?.client_toll_amount    ?? sheet?.toll_amount    ?? 0)
    const parking = Number(sheet?.client_parking_amount ?? sheet?.parking_amount ?? 0)
    const permit  = Number(sheet?.client_permit_amount  ?? sheet?.permit_amount  ?? 0)
    const bataCount = Number(sheet?.bata_client ?? sheet?.bata_driver ?? 0)
    const days = (b.total_days as number) ?? 1
    let calc
    if (b.trip_type === 'outstation') {
      const { hireCharges, ...rest } = calcOutstationTrip(actualKms, days, rate)
      calc = { ...rest, hireCharges, bataAmount: roundTo2(rate.outstation_bata_per_day * bataCount) }
    } else if (b.trip_type === 'airport') {
      const { hireCharges, ...rest } = calcAirportTrip(actualKms, actualMinutes, rate)
      calc = { ...rest, hireCharges, bataAmount: roundTo2(rate.local_bata * bataCount) }
    } else {
      const { hireCharges, ...rest } = calcLocalTrip(actualKms, actualMinutes, rate)
      calc = { ...rest, hireCharges, bataAmount: roundTo2(rate.local_bata * bataCount) }
    }
    const lineTotal = roundTo2(calc.hireCharges + toll + parking + permit + calc.bataAmount)
    return {
      booking_id: b.id as string,
      trip_sheet_id: (sheet?.id as string | null) ?? null,
      trip_date: b.pickup_date as string,
      booking_ref: b.booking_ref as string,
      vehicle_type: driverVehicleName || b.vehicle_type as string || '',
      vehicle_number: ((b.driver as { vehicle_number?: string } | null)?.vehicle_number) ?? null,
      guest_name: b.guest_name as string | null,
      pickup_location: b.pickup_location as string | null,
      drop_location: b.drop_location as string | null,
      trip_type: b.trip_type as string | null,
      actual_kms: actualKms, actual_hrs: displayHrs,
      package_type: calc.packageType, package_kms: calc.packageKms, package_rate: calc.packageRate,
      extra_kms: calc.extraKms, extra_km_rate: rate.extra_km_rate, extra_km_amount: calc.extraKmAmount,
      extra_hrs: calc.extraHrs, extra_hr_rate: rate.extra_hr_rate, extra_hr_amount: calc.extraHrAmount,
      hire_charges: calc.hireCharges,
      toll_amount: toll, parking_amount: parking, permit_amount: permit,
      bata_amount: calc.bataAmount, line_total: lineTotal,
    }
  }

  const lineItems = filteredBookings.map(b => calcBooking(b as Record<string, unknown>))
  const missedLineItems = missedBookings.map(b => calcBooking(b as Record<string, unknown>))
  const subtotal = roundTo2(lineItems.reduce((s, li) => s + li.hire_charges, 0))
  const total = roundTo2(lineItems.reduce((s, li) => s + li.line_total, 0))

  return NextResponse.json({
    client_id, period_from, period_to,
    line_items: lineItems,
    missed_line_items: missedLineItems,
    subtotal, total,
    trip_count: lineItems.length,
    missed_count: missedLineItems.length,
  })
}
