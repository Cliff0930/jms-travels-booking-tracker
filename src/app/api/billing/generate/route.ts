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
  let diff = c - o
  if (diff < 0) diff += 24 * 60
  return diff
}

function calcHours(open: string | null, close: string | null): number {
  return Math.round((calcMinutes(open, close) / 60) * 100) / 100
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100
}

// Client billing: fraction > 20 min rounds up to next full hour
function roundExtraHrsClient(extraMins: number): number {
  if (extraMins <= 0) return 0
  const full = Math.floor(extraMins / 60)
  return (extraMins % 60) > 20 ? full + 1 : full
}

interface RateCard {
  package_4hr_kms: number
  package_4hr_hrs: number
  package_4hr_rate: number
  package_airport_rate: number
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

function calcLocalTrip(actualKms: number, actualMinutes: number, rate: RateCard) {
  const pkg4Mins = rate.package_4hr_hrs * 60
  const extraMinsOver4 = Math.max(0, actualMinutes - pkg4Mins)
  // 4hr/40km slab: stay on 4hr package if kms fit AND overtime ≤ 1hr 45min (105 min); otherwise upgrade to 8hr
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

function calcForced4HR(actualKms: number, actualMinutes: number, rate: RateCard) {
  const pkgMins = rate.package_4hr_hrs * 60
  const extraMins = Math.max(0, actualMinutes - pkgMins)
  const extraKms = Math.max(0, actualKms - rate.package_4hr_kms)
  const extraHrs = roundExtraHrsClient(extraMins)
  const extraKmAmount = roundTo2(extraKms * rate.extra_km_rate)
  const extraHrAmount = roundTo2(extraHrs * rate.extra_hr_rate)
  const hireCharges = roundTo2(rate.package_4hr_rate + extraKmAmount + extraHrAmount)
  return { packageType: '4HR', packageKms: rate.package_4hr_kms, packageRate: rate.package_4hr_rate, extraKms, extraKmAmount, extraHrs, extraHrAmount, hireCharges }
}

function calcForced8HR(actualKms: number, actualMinutes: number, rate: RateCard) {
  const pkgMins = rate.package_8hr_hrs * 60
  const extraMins = Math.max(0, actualMinutes - pkgMins)
  const extraKms = Math.max(0, actualKms - rate.package_8hr_kms)
  const extraHrs = roundExtraHrsClient(extraMins)
  const extraKmAmount = roundTo2(extraKms * rate.extra_km_rate)
  const extraHrAmount = roundTo2(extraHrs * rate.extra_hr_rate)
  const hireCharges = roundTo2(rate.package_8hr_rate + extraKmAmount + extraHrAmount)
  return { packageType: '8HR', packageKms: rate.package_8hr_kms, packageRate: rate.package_8hr_rate, extraKms, extraKmAmount, extraHrs, extraHrAmount, hireCharges }
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
  const { company_id, period_from, period_to, is_inter_state = false, reverse_charge = false, guest_client_id, individual_client_id } = await request.json() as {
    company_id?: string; period_from: string; period_to: string; is_inter_state?: boolean; reverse_charge?: boolean; guest_client_id?: string; individual_client_id?: string
  }

  const isIndividual = !company_id && !!individual_client_id

  if (!period_from || !period_to) {
    return NextResponse.json({ error: 'period_from, period_to required' }, { status: 400 })
  }
  if (!isIndividual && !company_id) {
    return NextResponse.json({ error: 'company_id required for company invoices' }, { status: 400 })
  }

  // Fetch default rate cards
  const { data: defaultRates } = await supabase.from('rate_cards').select('*')
  const defaultRateMap: Record<string, RateCard> = {}
  for (const r of defaultRates ?? []) defaultRateMap[r.vehicle_type.toUpperCase()] = r

  // Company-specific rate overrides (skip for individual invoices — use defaults)
  const clientRateMap: Record<string, RateCard> = {}
  let tdsPercent = 0
  if (!isIndividual && company_id) {
    const { data: clientRates } = await supabase
      .from('client_rate_cards').select('*')
      .eq('company_id', company_id).eq('is_active', true)
      .lte('effective_from', period_from).order('effective_from', { ascending: true })
    for (const r of clientRates ?? []) clientRateMap[r.vehicle_type.toUpperCase()] = { ...defaultRateMap[r.vehicle_type.toUpperCase()], ...r }
    tdsPercent = (clientRates ?? [])[0]?.tds_percent ?? 0
  }

  // Company bata rates (skip for individual — use rate card defaults)
  const companyBataMap: Record<string, number> = {}
  if (!isIndividual && company_id) {
    const { data: companyBataRates } = await supabase
      .from('company_bata_rates').select('vehicle_name, trip_type, rate_per_bata')
      .eq('company_id', company_id).not('rate_per_bata', 'is', null)
    for (const r of companyBataRates ?? []) {
      const key = `${(r.vehicle_name ?? '').toUpperCase()}:${r.trip_type ?? 'all'}`
      companyBataMap[key] = Number(r.rate_per_bata)
    }
  }

  // Individual client snapshot (for individual invoices)
  let individualClient: { name: string; prefix: string | null; designation: string | null; primary_phone: string | null } | null = null
  if (isIndividual) {
    const { data: ic } = await supabase.from('clients').select('name, prefix, designation, primary_phone').eq('id', individual_client_id).single()
    individualClient = ic ?? null
  }

  const bookingSelect = `
    id, booking_ref, pickup_date, pickup_location, drop_location, trip_type, total_days,
    vehicle_type, billing_vehicle_type, guest_name, guest_client_id,
    driver:drivers!driver_id(vehicle_name, vehicle_number),
    trip_sheets(id, tripsheet_number, opening_km, closing_km, manual_opening_time, manual_closing_time,
      client_opening_km, client_closing_km, client_opening_time, client_closing_time,
      toll_amount, parking_amount, permit_amount, bata_driver, bata_client,
      client_toll_amount, client_parking_amount, client_permit_amount, slab_override)`

  // Fetch completed bookings in period
  let bookingsQ = supabase.from('bookings').select(bookingSelect)
    .eq('status', 'completed').neq('exclude_from_billing', true)
    .gte('pickup_date', period_from).lte('pickup_date', period_to)
    .order('pickup_date', { ascending: true })
  if (isIndividual) {
    bookingsQ = bookingsQ.eq('guest_client_id', individual_client_id!)
  } else {
    // Include bookings explicitly redirected to this company AND bookings whose own company_id matches (excluding those redirected elsewhere)
    bookingsQ = bookingsQ.or(`billing_company_id.eq.${company_id},and(company_id.eq.${company_id},billing_company_id.is.null)`)
  }
  const { data: bookings, error: bookingsErr } = await bookingsQ
  if (bookingsErr) return NextResponse.json({ error: bookingsErr.message }, { status: 500 })

  // Fetch guest client snapshot for within-company individual invoice
  let guestClient: { name: string; prefix: string | null; designation: string | null } | null = null
  if (guest_client_id) {
    const { data: gc } = await supabase.from('clients').select('name, prefix, designation').eq('id', guest_client_id).single()
    guestClient = gc ?? null
  }

  // Build set of booking IDs already in a finalised invoice
  const invoicedBookingIds = new Set<string>()
  let finalisedInvsQ = supabase.from('invoices').select('id').in('status', ['sent', 'paid', 'partially_paid', 'overdue'])
  if (isIndividual) {
    finalisedInvsQ = finalisedInvsQ.eq('individual_client_id', individual_client_id!)
  } else {
    finalisedInvsQ = finalisedInvsQ.eq('company_id', company_id!)
  }
  const { data: finalisedInvs } = await finalisedInvsQ
  if (finalisedInvs && finalisedInvs.length > 0) {
    const { data: invoicedItems } = await supabase
      .from('invoice_line_items').select('booking_id')
      .in('invoice_id', finalisedInvs.map(i => i.id))
    for (const item of invoicedItems ?? []) {
      if (item.booking_id) invoicedBookingIds.add(item.booking_id)
    }
  }

  // Exclude already-invoiced bookings; also filter by guest if within-company individual invoice
  const filteredBookings = (bookings ?? []).filter(b =>
    !invoicedBookingIds.has(b.id) &&
    (!guest_client_id || (b as Record<string, unknown>).guest_client_id === guest_client_id)
  )

  // Fetch older completed bookings (before period_from) not yet invoiced
  let olderQ = supabase.from('bookings').select(bookingSelect)
    .eq('status', 'completed').neq('exclude_from_billing', true)
    .lt('pickup_date', period_from).order('pickup_date', { ascending: true })
  if (isIndividual) {
    olderQ = olderQ.eq('guest_client_id', individual_client_id!)
  } else {
    olderQ = olderQ.or(`billing_company_id.eq.${company_id},and(company_id.eq.${company_id},billing_company_id.is.null)`)
  }
  const { data: olderBookings } = await olderQ
  const missedBookings = (olderBookings ?? []).filter(b =>
    !invoicedBookingIds.has(b.id) &&
    (!guest_client_id || (b as Record<string, unknown>).guest_client_id === guest_client_id)
  )

  const lineItems = []
  let totalSubtotal = 0, totalExtras = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0

  for (const b of filteredBookings) {
    const sheets = (b.trip_sheets ?? []) as Array<Record<string, unknown>>
    const sheet = sheets[0] // use first sheet per booking
    const billingVehicle = ((b.billing_vehicle_type as string | null) ?? '').toUpperCase()
    const driverVehicleName = ((b.driver as { vehicle_name?: string; vehicle_number?: string } | null)?.vehicle_name ?? '').toUpperCase()
    const vType = billingVehicle || driverVehicleName || (b.vehicle_type ?? '').toUpperCase()
    const rate: RateCard = clientRateMap[vType] ?? defaultRateMap[vType] ?? {
      package_4hr_kms: 40, package_4hr_hrs: 4, package_4hr_rate: 900,
      package_airport_rate: 0,
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
    const actualMinutes = calcMinutes(
      (sheet?.client_opening_time  ?? sheet?.manual_opening_time)  as string | null,
      (sheet?.client_closing_time  ?? sheet?.manual_closing_time) as string | null
    )
    const slabOverride = (sheet?.slab_override as string | null | undefined) ?? null
    // For outstation, store total_days in actual_hrs (hrs unused in billing; PDF uses this to show "X Day/s")
    const displayHrs = (slabOverride === 'OUTSTATION' || (!slabOverride && b.trip_type === 'outstation')) ? (b.total_days ?? 1) : actualHrs
    const toll    = Number(sheet?.client_toll_amount    ?? sheet?.toll_amount    ?? 0)
    const parking = Number(sheet?.client_parking_amount ?? sheet?.parking_amount ?? 0)
    const permit  = Number(sheet?.client_permit_amount  ?? sheet?.permit_amount  ?? 0)
    // Use bata_client for invoicing (client threshold: open<06:00, close>22:00)
    // Fall back to bata_driver for older records that don't have bata_client yet
    const bataClientCount = Number(sheet?.bata_client ?? sheet?.bata_driver ?? 0)
    const days = b.total_days ?? 1

    // Company bata rate (what we charge the company) — look up by vehicle+trip_type, fall back to vehicle+all, then rate card default
    const cbKey  = `${billingVehicle || driverVehicleName}:${b.trip_type ?? 'local'}`
    const cbKeyAll = `${billingVehicle || driverVehicleName}:all`
    let calc
    if (slabOverride === 'OUTSTATION' || (!slabOverride && b.trip_type === 'outstation')) {
      const outstationBataRate = companyBataMap[cbKey] ?? companyBataMap[cbKeyAll] ?? rate.outstation_bata_per_day ?? 450
      const { bataAmount: _b, ...outstationCalc } = calcOutstationTrip(actualKms, days, rate)
      calc = { ...outstationCalc, bataAmount: roundTo2(outstationBataRate * bataClientCount) }
    } else if (slabOverride === 'AIRPORT' || (!slabOverride && b.trip_type === 'airport')) {
      const airportBataRate = companyBataMap[cbKey] ?? companyBataMap[cbKeyAll] ?? rate.local_bata ?? 300
      calc = { ...calcAirportTrip(actualKms, actualMinutes, rate), bataAmount: roundTo2(bataClientCount * airportBataRate) }
    } else if (slabOverride === '8HR') {
      const bataRate = companyBataMap[cbKey] ?? companyBataMap[cbKeyAll] ?? rate.local_bata ?? 300
      calc = { ...calcForced8HR(actualKms, actualMinutes, rate), bataAmount: roundTo2(bataClientCount * bataRate) }
    } else if (slabOverride === '4HR') {
      const bataRate = companyBataMap[cbKey] ?? companyBataMap[cbKeyAll] ?? rate.local_bata ?? 300
      calc = { ...calcForced4HR(actualKms, actualMinutes, rate), bataAmount: roundTo2(bataClientCount * bataRate) }
    } else {
      const localBataRate = companyBataMap[cbKey] ?? companyBataMap[cbKeyAll] ?? rate.local_bata ?? 300
      const { bataAmount: _b, ...localCalc } = { bataAmount: 0, ...calcLocalTrip(actualKms, actualMinutes, rate) }
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
      vehicle_type: billingVehicle || driverVehicleName || b.vehicle_type || '',
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

  // Process missed (older, never-invoiced) bookings — same calculation logic, separate list
  const missedLineItems: Record<string, unknown>[] = []
  for (const b of missedBookings) {
    const sheets = (b.trip_sheets ?? []) as Array<Record<string, unknown>>
    const sheet = sheets[0]
    const driverVehicleName = ((b.driver as { vehicle_name?: string; vehicle_number?: string } | null)?.vehicle_name ?? '').toUpperCase()
    const vType = driverVehicleName || (b.vehicle_type ?? '').toUpperCase()
    const rate: RateCard = clientRateMap[vType] ?? defaultRateMap[vType] ?? {
      package_4hr_kms: 40, package_4hr_hrs: 4, package_4hr_rate: 900,
      package_airport_rate: 0,
      package_8hr_kms: 80, package_8hr_hrs: 8, package_8hr_rate: 1900,
      extra_km_rate: 14, extra_hr_rate: 250,
      outstation_rate_per_km: 14, outstation_min_kms_per_day: 300,
      local_bata: 300, outstation_bata_per_day: 450,
    }
    const openKm  = Number(sheet?.client_opening_km  ?? sheet?.opening_km  ?? 0)
    const closeKm = Number(sheet?.client_closing_km  ?? sheet?.closing_km  ?? 0)
    const actualKms = closeKm > openKm ? closeKm - openKm : 0
    const actualHrs = calcHours((sheet?.client_opening_time ?? sheet?.manual_opening_time) as string | null, (sheet?.client_closing_time ?? sheet?.manual_closing_time) as string | null)
    const actualMinutes = calcMinutes((sheet?.client_opening_time ?? sheet?.manual_opening_time) as string | null, (sheet?.client_closing_time ?? sheet?.manual_closing_time) as string | null)
    const slabOverrideMissed = (sheet?.slab_override as string | null | undefined) ?? null
    const displayHrs = (slabOverrideMissed === 'OUTSTATION' || (!slabOverrideMissed && b.trip_type === 'outstation')) ? (b.total_days ?? 1) : actualHrs
    const toll    = Number(sheet?.client_toll_amount    ?? sheet?.toll_amount    ?? 0)
    const parking = Number(sheet?.client_parking_amount ?? sheet?.parking_amount ?? 0)
    const permit  = Number(sheet?.client_permit_amount  ?? sheet?.permit_amount  ?? 0)
    const bataClientCount = Number(sheet?.bata_client ?? sheet?.bata_driver ?? 0)
    const days = b.total_days ?? 1
    const cbKey = `${driverVehicleName}:${b.trip_type ?? 'local'}`
    const cbKeyAll = `${driverVehicleName}:all`
    let calc
    if (slabOverrideMissed === 'OUTSTATION' || (!slabOverrideMissed && b.trip_type === 'outstation')) {
      const outstationBataRate = companyBataMap[cbKey] ?? companyBataMap[cbKeyAll] ?? rate.outstation_bata_per_day ?? 450
      const { bataAmount: _b, ...outstationCalc } = calcOutstationTrip(actualKms, days, rate)
      calc = { ...outstationCalc, bataAmount: roundTo2(outstationBataRate * bataClientCount) }
    } else if (slabOverrideMissed === 'AIRPORT' || (!slabOverrideMissed && b.trip_type === 'airport')) {
      const airportBataRate = companyBataMap[cbKey] ?? companyBataMap[cbKeyAll] ?? rate.local_bata ?? 300
      calc = { ...calcAirportTrip(actualKms, actualMinutes, rate), bataAmount: roundTo2(bataClientCount * airportBataRate) }
    } else if (slabOverrideMissed === '8HR') {
      const bataRate = companyBataMap[cbKey] ?? companyBataMap[cbKeyAll] ?? rate.local_bata ?? 300
      calc = { ...calcForced8HR(actualKms, actualMinutes, rate), bataAmount: roundTo2(bataClientCount * bataRate) }
    } else if (slabOverrideMissed === '4HR') {
      const bataRate = companyBataMap[cbKey] ?? companyBataMap[cbKeyAll] ?? rate.local_bata ?? 300
      calc = { ...calcForced4HR(actualKms, actualMinutes, rate), bataAmount: roundTo2(bataClientCount * bataRate) }
    } else {
      const localBataRate = companyBataMap[cbKey] ?? companyBataMap[cbKeyAll] ?? rate.local_bata ?? 300
      const { bataAmount: _b, ...localCalc } = { bataAmount: 0, ...calcLocalTrip(actualKms, actualMinutes, rate) }
      calc = { ...localCalc, bataAmount: roundTo2(bataClientCount * localBataRate) }
    }
    const gstResult = reverse_charge
      ? { gstTaxable: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, cgstRate: 0, sgstRate: 0, igstRate: 0 }
      : calcGST(calc.hireCharges, is_inter_state)
    const { gstTaxable, cgstAmount, sgstAmount, igstAmount, cgstRate, sgstRate, igstRate } = gstResult
    const lineTotal = roundTo2(calc.hireCharges + cgstAmount + sgstAmount + igstAmount + toll + parking + permit + calc.bataAmount)
    missedLineItems.push({
      booking_id: b.id, trip_sheet_id: (sheet?.id as string | null) ?? null,
      trip_date: b.pickup_date, booking_ref: b.booking_ref,
      vehicle_type: driverVehicleName || b.vehicle_type || '',
      vehicle_number: ((b.driver as { vehicle_name?: string; vehicle_number?: string } | null)?.vehicle_number) ?? null,
      guest_name: b.guest_name, pickup_location: b.pickup_location, drop_location: b.drop_location,
      trip_type: b.trip_type, package_type: calc.packageType, actual_kms: actualKms, actual_hrs: displayHrs,
      package_kms: calc.packageKms, package_rate: calc.packageRate,
      extra_kms: calc.extraKms, extra_km_rate: rate.extra_km_rate, extra_km_amount: calc.extraKmAmount,
      extra_hrs: calc.extraHrs, extra_hr_rate: rate.extra_hr_rate, extra_hr_amount: calc.extraHrAmount,
      hire_charges: calc.hireCharges, toll_amount: toll, parking_amount: parking, permit_amount: permit,
      bata_amount: calc.bataAmount, bill_bata: true, gst_taxable: gstTaxable,
      cgst_rate: cgstRate, sgst_rate: sgstRate, igst_rate: igstRate,
      cgst_amount: cgstAmount, sgst_amount: sgstAmount, igst_amount: igstAmount, line_total: lineTotal,
    })
  }

  // Grand total = (hire + extras + GST) rounded to nearest whole rupee
  const grandTotal = Math.round(totalSubtotal + totalExtras + totalCgst + totalSgst + totalIgst)
  const tdsAmount = roundTo2(grandTotal * tdsPercent / 100)

  return NextResponse.json({
    company_id, period_from, period_to, is_inter_state, reverse_charge,
    tds_percent: tdsPercent,
    guest_client: guestClient,
    individual_client: individualClient,
    line_items: lineItems,
    missed_line_items: missedLineItems,
    subtotal: roundTo2(totalSubtotal),
    cgst_amount: roundTo2(totalCgst),
    sgst_amount: roundTo2(totalSgst),
    igst_amount: roundTo2(totalIgst),
    tds_amount: tdsAmount,
    grand_total: roundTo2(grandTotal - tdsAmount),
    trip_count: lineItems.length,
    missed_count: missedLineItems.length,
  })
}
