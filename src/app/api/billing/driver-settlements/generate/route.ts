import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function parseHHMM(t: string | null): number | null {
  if (!t) return null
  const m = t.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i)
  if (!m) return null
  let h = parseInt(m[1]), min = parseInt(m[2])
  const p = m[3]?.toUpperCase()
  if (p === 'PM' && h !== 12) h += 12
  if (p === 'AM' && h === 12) h = 0
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
}

const DEFAULT_RATE: RateCard = {
  package_4hr_kms: 40, package_4hr_hrs: 4, package_4hr_rate: 900,
  package_8hr_kms: 80, package_8hr_hrs: 8, package_8hr_rate: 1900,
  extra_km_rate: 14, extra_hr_rate: 250,
  outstation_rate_per_km: 14, outstation_min_kms_per_day: 300,
}

function calcHireCharges(actualKms: number, actualHrs: number, days: number, tripType: string, rate: RateCard): number {
  if (tripType === 'outstation') {
    const billable = Math.max(actualKms, rate.outstation_min_kms_per_day * days)
    return r2(billable * rate.outstation_rate_per_km)
  }
  const use4 = actualHrs <= rate.package_4hr_hrs && actualKms <= rate.package_4hr_kms
  const pkgKms = use4 ? rate.package_4hr_kms : rate.package_8hr_kms
  const pkgHrs = use4 ? rate.package_4hr_hrs : rate.package_8hr_hrs
  const pkgRate = use4 ? rate.package_4hr_rate : rate.package_8hr_rate
  const extraKmAmt = r2(Math.max(0, actualKms - pkgKms) * rate.extra_km_rate)
  const extraHrAmt = r2(Math.max(0, actualHrs - pkgHrs) * rate.extra_hr_rate)
  return r2(pkgRate + extraKmAmt + extraHrAmt)
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const { driver_id, period_from, period_to } = await request.json() as {
    driver_id: string; period_from: string; period_to: string
  }

  if (!driver_id || !period_from || !period_to)
    return NextResponse.json({ error: 'driver_id, period_from, period_to required' }, { status: 400 })

  // 1. Driver info
  const { data: driver, error: dErr } = await supabase
    .from('drivers')
    .select('id, name, vehicle_name, vehicle_number, vehicle_type, bata_rate, driver_type, commission_percent, monthly_salary, advance_emi_amount')
    .eq('id', driver_id)
    .single()
  if (dErr || !driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })

  // 2. Global interest rate
  const { data: rateSetting } = await supabase.from('app_settings').select('value').eq('key', 'advance_interest_rate_pct').maybeSingle()
  const interestRatePct = parseFloat(rateSetting?.value ?? '2')

  // 3. Completed trips for this driver in period
  const { data: bookings, error: bErr } = await supabase
    .from('bookings')
    .select(`
      id, booking_ref, pickup_date, company_id, trip_type, total_days,
      vehicle_type,
      company:companies!company_id(id, name),
      trip_sheets(id, tripsheet_number, opening_km, closing_km,
        manual_opening_time, manual_closing_time,
        toll_amount, parking_amount, permit_amount, bata_driver)
    `)
    .eq('driver_id', driver_id)
    .eq('status', 'completed')
    .gte('pickup_date', period_from)
    .lte('pickup_date', period_to)
    .order('pickup_date', { ascending: true })

  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  const trips = bookings ?? []
  const companyIds = [...new Set(trips.map(b => b.company_id).filter(Boolean))] as string[]

  // 4. Rate cards per company
  const clientRatesByCompany: Record<string, Record<string, RateCard>> = {}
  if (companyIds.length > 0) {
    const { data: clientRates } = await supabase
      .from('client_rate_cards')
      .select('*')
      .in('company_id', companyIds)
      .eq('is_active', true)
      .lte('effective_from', period_from)
      .order('effective_from', { ascending: true })

    for (const r of clientRates ?? []) {
      if (!clientRatesByCompany[r.company_id]) clientRatesByCompany[r.company_id] = {}
      clientRatesByCompany[r.company_id][r.vehicle_type.toUpperCase()] = { ...DEFAULT_RATE, ...r }
    }
  }

  // 5. Default rate cards
  const { data: defaultRates } = await supabase.from('rate_cards').select('*')
  const defaultRateMap: Record<string, RateCard> = {}
  for (const r of defaultRates ?? []) defaultRateMap[r.vehicle_type.toUpperCase()] = { ...DEFAULT_RATE, ...r }

  // 6. Company bata driver rates
  const { data: companyBataRates } = await supabase
    .from('company_bata_rates')
    .select('company_id, vehicle_name, driver_bata_rate, trip_type')
    .in('company_id', companyIds.length > 0 ? companyIds : ['__none__'])
    .not('driver_bata_rate', 'is', null)

  const bataMap: Record<string, number> = {}
  for (const r of companyBataRates ?? []) {
    const key = `${r.company_id}:${r.vehicle_name?.toUpperCase() ?? ''}:${r.trip_type ?? 'all'}`
    bataMap[key] = Number(r.driver_bata_rate)
  }

  // 7. Outstanding advances
  const { data: advances } = await supabase
    .from('driver_advances')
    .select('amount')
    .eq('driver_id', driver_id)
    .eq('status', 'outstanding')
  const advanceOutstanding = r2((advances ?? []).reduce((s, a) => s + Number(a.amount), 0))

  // 8. Calculate per trip
  const driverVehicle = (driver.vehicle_name ?? '').toUpperCase()
  const commissionPct = Number(driver.commission_percent ?? 20)
  const defaultBataRate = Number(driver.bata_rate ?? 300)

  const tripDetails: Record<string, unknown>[] = []
  let totalHire = 0, totalBata = 0, totalReimb = 0

  for (const b of trips) {
    const sheets = (b.trip_sheets ?? []) as Array<Record<string, unknown>>
    const sheet = sheets[0]
    const companyId = b.company_id ?? ''
    const company = b.company as unknown as { name: string } | null

    const rate: RateCard =
      clientRatesByCompany[companyId]?.[driverVehicle] ??
      defaultRateMap[driverVehicle] ??
      DEFAULT_RATE

    const openKm = Number(sheet?.opening_km ?? 0)
    const closeKm = Number(sheet?.closing_km ?? 0)
    const actualKms = closeKm > openKm ? closeKm - openKm : 0
    const actualHrs = calcHours(sheet?.manual_opening_time as string | null, sheet?.manual_closing_time as string | null)
    const days = b.total_days ?? 1

    const hireCharges = calcHireCharges(actualKms, actualHrs, days, b.trip_type, rate)
    const hireEarnings = r2(hireCharges * (1 - commissionPct / 100))

    const bataCount = Number(sheet?.bata_driver ?? 0)
    const tripType = b.trip_type ?? 'local'
    const bataKey = `${companyId}:${driverVehicle}:${tripType}`
    const bataKeyAll = `${companyId}:${driverVehicle}:all`
    const driverBataRate = bataMap[bataKey] ?? bataMap[bataKeyAll] ?? defaultBataRate
    // Airport bata is collected from client only — driver is not paid
    const bataEarnings = tripType === 'airport' ? 0 : r2(bataCount * driverBataRate)

    const toll = Number(sheet?.toll_amount ?? 0)
    const parking = Number(sheet?.parking_amount ?? 0)
    const permit = Number(sheet?.permit_amount ?? 0)
    const reimbursements = r2(toll + parking + permit)
    const tripTotal = r2(hireEarnings + bataEarnings + reimbursements)

    totalHire += hireEarnings
    totalBata += bataEarnings
    totalReimb += reimbursements

    tripDetails.push({
      booking_id: b.id,
      trip_date: b.pickup_date,
      booking_ref: b.booking_ref,
      tripsheet_number: (sheet?.tripsheet_number as string | null) ?? null,
      company_name: company?.name ?? '',
      trip_type: tripType,
      vehicle_type: driver.vehicle_name,
      actual_kms: actualKms,
      actual_hrs: actualHrs,
      client_hire_charges: hireCharges,
      commission_percent: commissionPct,
      hire_earnings: hireEarnings,
      bata_count: bataCount,
      driver_bata_rate: driverBataRate,
      bata_earnings: bataEarnings,
      toll_amount: toll,
      parking_amount: parking,
      permit_amount: permit,
      trip_total: tripTotal,
    })
  }

  const salaryAmount = driver.driver_type === 'salary' ? Number(driver.monthly_salary ?? 0) : 0
  const grossEarnings = r2(totalHire + totalBata + totalReimb + salaryAmount)

  const principalDeduction = driver.advance_emi_amount
    ? Math.min(Number(driver.advance_emi_amount), advanceOutstanding)
    : advanceOutstanding
  const interestDeduction = r2(advanceOutstanding * interestRatePct / 100)
  const netPayable = r2(grossEarnings - principalDeduction - interestDeduction)

  return NextResponse.json({
    driver_id,
    driver_name: driver.name,
    driver_vehicle: driver.vehicle_name,
    driver_vehicle_number: driver.vehicle_number,
    period_from,
    period_to,
    total_trips: tripDetails.length,
    trip_details: tripDetails,
    hire_earnings: r2(totalHire),
    bata_earnings: r2(totalBata),
    reimbursements: r2(totalReimb),
    salary_amount: salaryAmount,
    gross_earnings: grossEarnings,
    advance_outstanding: advanceOutstanding,
    advance_principal_deduction: r2(principalDeduction),
    advance_interest_deduction: interestDeduction,
    interest_rate_pct: interestRatePct,
    net_payable: netPayable,
  })
}
