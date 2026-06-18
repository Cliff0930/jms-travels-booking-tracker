import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateDriverToken } from '@/lib/utils/driver-token'

function getTodayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function driverStatusUrl(bookingId: string, action: 'arrived' | 'completed'): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://booking.jmstravels.net'
  const token = generateDriverToken(bookingId, action)
  return `${appUrl}/driver-status?booking=${bookingId}&status=${action}&token=${token}`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const bookingId = searchParams.get('booking')
  const action = searchParams.get('action')
  const legId = searchParams.get('leg_id')

  if (!bookingId || (action !== 'arrived' && action !== 'completed')) {
    return NextResponse.json({ redirect_to: null })
  }

  const supabase = createAdminClient()

  // Leg-specific links: smart redirect for multi-day trips
  if (legId) {
    const today = getTodayIST()
    const [{ data: leg }, { data: bookingForLeg }, { data: allLegsRaw }] = await Promise.all([
      supabase.from('booking_legs').select('id, day_number, leg_date, driver_id').eq('id', legId).single(),
      supabase.from('bookings').select('driver_id').eq('id', bookingId).single(),
      supabase.from('booking_legs').select('id, day_number, leg_date, driver_id').eq('booking_id', bookingId).order('day_number', { ascending: true }),
    ])

    if (!leg) return NextResponse.json({ redirect_to: null })

    if (leg.leg_date && leg.leg_date > today) {
      return NextResponse.json({ redirect_to: null, future_trip: true, trip_date: leg.leg_date })
    }

    const bookingDriverId = bookingForLeg?.driver_id ?? null
    const legDriverId = leg.driver_id || bookingDriverId
    if (!legDriverId) return NextResponse.json({ redirect_to: null })

    // Only consider legs assigned to this driver (leg.driver_id null means uses booking-level driver)
    const driverLegs = (allLegsRaw || []).filter(l => (l.driver_id || bookingDriverId) === legDriverId)
    if (driverLegs.length === 0) return NextResponse.json({ redirect_to: null })

    const { data: sheets } = await supabase
      .from('trip_sheets')
      .select('booking_leg_id, opening_time, closing_time')
      .eq('booking_id', bookingId)
      .in('booking_leg_id', driverLegs.map(l => l.id))

    const sheetByLeg: Record<string, { opening_time: string | null; closing_time: string | null }> = {}
    for (const s of (sheets || [])) {
      if (s.booking_leg_id) sheetByLeg[s.booking_leg_id] = s
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://booking.jmstravels.net'
    const bId = bookingId as string
    function legUrl(lId: string, a: 'arrived' | 'completed'): string {
      return `${appUrl}/driver-status?booking=${bId}&status=${a}&token=${generateDriverToken(bId, a)}&leg_id=${lId}`
    }
    function legState(lId: string): 'not_started' | 'in_progress' | 'completed' {
      const s = sheetByLeg[lId]
      if (!s) return 'not_started'
      if (s.closing_time) return 'completed'
      return 'in_progress'
    }

    const thisState = legState(legId)

    // This leg already completed → redirect to next not-started leg for this driver
    if (thisState === 'completed') {
      const next = driverLegs.find(l => l.day_number > leg.day_number && legState(l.id) === 'not_started')
      if (next) return NextResponse.json({ redirect_to: legUrl(next.id, 'arrived') })
      return NextResponse.json({ redirect_to: null })
    }

    // Arrived link on a leg that's already in progress → redirect to its completed link
    if (thisState === 'in_progress' && action === 'arrived') {
      return NextResponse.json({ redirect_to: legUrl(legId, 'completed') })
    }

    // A previous leg is still in progress → driver must complete it first
    if (action === 'arrived') {
      const prev = driverLegs.find(l => l.day_number < leg.day_number && legState(l.id) === 'in_progress')
      if (prev) return NextResponse.json({ redirect_to: legUrl(prev.id, 'completed') })
    }

    return NextResponse.json({ redirect_to: null })
  }

  // Load booking + driver info
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, driver_id, pickup_date, pickup_time, driver:drivers(uses_app, last_app_seen)')
    .eq('id', bookingId)
    .single()

  if (!booking || !booking.driver_id) return NextResponse.json({ redirect_to: null })

  // App drivers see trips via the app — no WhatsApp link redirect needed
  const driver = booking.driver as { uses_app?: boolean; last_app_seen?: string | null } | null
  const driverUsesApp = !!(
    driver?.uses_app &&
    driver?.last_app_seen &&
    new Date(driver.last_app_seen) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  )
  if (driverUsesApp) return NextResponse.json({ redirect_to: null })

  const driverId = booking.driver_id
  const today = getTodayIST()

  // --- Step 0: Future-dated trip — driver opened a link too early ---
  if (booking.pickup_date && booking.pickup_date > today) {
    // Redirect to today's active trip if one exists; otherwise tell the page it's a future link
    const { data: todayInProgress } = await supabase
      .from('bookings')
      .select('id')
      .eq('driver_id', driverId)
      .eq('status', 'in_progress')
      .limit(1)
      .maybeSingle()

    if (todayInProgress) {
      return NextResponse.json({ redirect_to: driverStatusUrl(todayInProgress.id, 'completed') })
    }

    const { data: todayConfirmed } = await supabase
      .from('bookings')
      .select('id')
      .eq('driver_id', driverId)
      .eq('status', 'confirmed')
      .eq('pickup_date', today)
      .order('pickup_time', { ascending: true, nullsFirst: false })
      .order('booking_ref', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (todayConfirmed) {
      return NextResponse.json({ redirect_to: driverStatusUrl(todayConfirmed.id, 'arrived') })
    }

    // No today trips — surface the date so the page can show a friendly message
    return NextResponse.json({ redirect_to: null, future_trip: true, trip_date: booking.pickup_date })
  }

  // --- Step 1: Any in_progress booking for this driver? ---
  // An in_progress trip must be completed before anything else.
  const { data: inProgressRows } = await supabase
    .from('bookings')
    .select('id')
    .eq('driver_id', driverId)
    .eq('status', 'in_progress')

  if (inProgressRows && inProgressRows.length > 0) {
    // Current link is already the correct action (in_progress + completed) — don't redirect
    const isCorrectAction = booking.status === 'in_progress' && action === 'completed'
    if (!isCorrectAction) {
      // Prefer an in_progress booking other than the current one (edge case: two in_progress)
      const target = inProgressRows.find(b => b.id !== bookingId) ?? inProgressRows[0]
      return NextResponse.json({ redirect_to: driverStatusUrl(target.id, 'completed') })
    }
  }

  // --- Step 2: Current booking already finished or cancelled? ---
  if (booking.status === 'completed' || booking.status === 'cancelled') {
    const { data: nextTrip } = await supabase
      .from('bookings')
      .select('id')
      .eq('driver_id', driverId)
      .eq('status', 'confirmed')
      .eq('pickup_date', today)
      .order('pickup_time', { ascending: true, nullsFirst: false })
      .order('booking_ref', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (nextTrip) {
      return NextResponse.json({ redirect_to: driverStatusUrl(nextTrip.id, 'arrived') })
    }
    return NextResponse.json({ redirect_to: null })
  }

  // --- Step 3: Earlier confirmed trip exists today? ---
  // Only applies when driver opens an arrived link — redirect to the earliest trip first.
  if (
    booking.status === 'confirmed' &&
    action === 'arrived' &&
    booking.pickup_date &&
    booking.pickup_time
  ) {
    if (booking.pickup_date === today) {
      const { data: earlierTrip } = await supabase
        .from('bookings')
        .select('id')
        .eq('driver_id', driverId)
        .eq('status', 'confirmed')
        .eq('pickup_date', today)
        .lt('pickup_time', booking.pickup_time)
        .order('pickup_time', { ascending: true, nullsFirst: false })
        .order('booking_ref', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (earlierTrip) {
        return NextResponse.json({ redirect_to: driverStatusUrl(earlierTrip.id, 'arrived') })
      }
    }
  }

  // Correct link — show form as-is
  return NextResponse.json({ redirect_to: null })
}
