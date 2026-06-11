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

  // Leg-specific links are operator-managed — never redirect them
  if (legId) return NextResponse.json({ redirect_to: null })
  if (!bookingId || (action !== 'arrived' && action !== 'completed')) {
    return NextResponse.json({ redirect_to: null })
  }

  const supabase = createAdminClient()

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
    const today = getTodayIST()
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
    const today = getTodayIST()
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
