import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyDriverToken } from '@/lib/utils/driver-token'
import { sendToAll } from '@/lib/whatsapp/send'
import { markShortLinkUsed } from '@/lib/utils/short-link'

async function getDistanceKm(origin: string, destination: string): Promise<number | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return null
  try {
    const params = new URLSearchParams({ origins: origin, destinations: destination, key: apiKey, units: 'metric' })
    const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`)
    const data = await res.json() as {
      rows?: Array<{ elements?: Array<{ status: string; distance?: { value: number } }> }>
    }
    const meters = data?.rows?.[0]?.elements?.[0]?.distance?.value
    if (typeof meters !== 'number') return null
    return Math.round(meters / 100) / 10
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const {
    booking_id, status, token,
    tripsheet_number, opening_km, closing_km,
    toll_amount, parking_amount,
    lat, lng,
    link_code,
    leg_id,
  } = await request.json()
  const supabase = createAdminClient()

  if (!verifyDriverToken(booking_id, status, token)) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(id, name, primary_phone), driver:drivers(name, phone, vehicle_name, vehicle_number, vehicle_color)')
    .eq('id', booking_id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const newBookingStatus = status === 'arrived' ? 'in_progress' : 'completed'
  const driverStatus = status === 'arrived' ? 'on_duty' : 'available'

  await supabase.from('bookings').update({ status: newBookingStatus, updated_at: new Date().toISOString() }).eq('id', booking_id)
  await supabase.from('booking_status_history').insert({
    booking_id,
    old_status: booking.status,
    new_status: newBookingStatus,
    changed_by: 'driver',
  })
  if (booking.driver_id) {
    await supabase.from('drivers').update({ status: driverStatus }).eq('id', booking.driver_id)
  }

  // Trip sheet handling
  if (status === 'arrived') {
    await supabase.from('trip_sheets').insert({
      booking_id,
      driver_id: booking.driver_id || null,
      booking_leg_id: leg_id || null,
      tripsheet_number: tripsheet_number || null,
      opening_km: opening_km ?? null,
      opening_lat: lat ?? null,
      opening_lng: lng ?? null,
      opening_time: new Date().toISOString(),
    }).then(({ error }) => { if (error) console.error('trip_sheets insert error:', error.message) })
  } else {
    // Find matching sheet: prefer leg-specific, fall back to booking-level
    let sheetQuery = supabase
      .from('trip_sheets')
      .select('id, opening_lat, opening_lng')
      .eq('booking_id', booking_id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (leg_id) {
      sheetQuery = sheetQuery.eq('booking_leg_id', leg_id)
    } else {
      sheetQuery = sheetQuery.is('booking_leg_id', null)
    }

    const { data: sheet } = await sheetQuery.single()

    let officeToPickupKm: number | null = null
    let dropToOfficeKm: number | null = null

    const { data: distSetting } = await supabase.from('app_settings').select('value').eq('key', 'distance_calculation_enabled').single()
    const distEnabled = distSetting?.value !== 'false'

    if (distEnabled) {
      const { data: officeSetting } = await supabase.from('app_settings').select('value').eq('key', 'office_location').single()
      if (officeSetting?.value) {
        try {
          const office = JSON.parse(officeSetting.value) as { address?: string }
          if (office.address) {
            if (sheet?.opening_lat && sheet?.opening_lng) {
              officeToPickupKm = await getDistanceKm(office.address, `${sheet.opening_lat},${sheet.opening_lng}`)
            }
            if (lat && lng) {
              dropToOfficeKm = await getDistanceKm(`${lat},${lng}`, office.address)
            }
          }
        } catch { /* non-critical */ }
      }
    }

    if (sheet) {
      await supabase.from('trip_sheets').update({
        closing_km: closing_km ?? null,
        closing_lat: lat ?? null,
        closing_lng: lng ?? null,
        closing_time: new Date().toISOString(),
        office_to_pickup_km: officeToPickupKm,
        drop_to_office_km: dropToOfficeKm,
        toll_amount: toll_amount ?? null,
        parking_amount: parking_amount ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', sheet.id)
    } else {
      await supabase.from('trip_sheets').insert({
        booking_id,
        driver_id: booking.driver_id || null,
        booking_leg_id: leg_id || null,
        closing_km: closing_km ?? null,
        closing_lat: lat ?? null,
        closing_lng: lng ?? null,
        closing_time: new Date().toISOString(),
        office_to_pickup_km: officeToPickupKm,
        drop_to_office_km: dropToOfficeKm,
        toll_amount: toll_amount ?? null,
        parking_amount: parking_amount ?? null,
      })
    }
  }

  // Notify client
  const client = booking.client as { id?: string; name?: string; primary_phone?: string } | null
  const driver = booking.driver as { name?: string; phone?: string; vehicle_name?: string; vehicle_number?: string; vehicle_color?: string } | null
  const guestPhone = booking.guest_phone || null
  const adminPhone = client?.primary_phone || null
  const clientName = booking.guest_name || client?.name || 'there'

  if ((guestPhone || adminPhone) && driver) {
    const vehicleLine = [driver.vehicle_name, driver.vehicle_color ? `(${driver.vehicle_color})` : null].filter(Boolean).join(' ')
    let body: string

    if (status === 'arrived') {
      body = [
        `Hi ${clientName}, your driver ${driver.name} has arrived at your pickup location.`,
        ``,
        vehicleLine ? `Vehicle: ${vehicleLine} — ${driver.vehicle_number || ''}` : `Vehicle: ${driver.vehicle_number || 'assigned'}`,
        ``,
        `Please proceed to your pickup point. Safe travels! — JMS Travels`,
      ].join('\n')
    } else {
      const dateStr = booking.pickup_date
        ? new Date(booking.pickup_date + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
        : null
      body = [
        `Hi ${clientName}, your trip has been completed successfully.`,
        ``,
        `Booking: ${booking.booking_ref}`,
        booking.pickup_location ? `Pickup: ${booking.pickup_location}` : null,
        booking.drop_location ? `Drop: ${booking.drop_location}` : null,
        dateStr ? `Date: ${dateStr}` : null,
        ``,
        `Thank you for choosing JMS Travels! We look forward to serving you again.`,
      ].filter(l => l !== null).join('\n')
    }

    await sendToAll([guestPhone, adminPhone], body, {
      booking_id,
      client_id: client?.id || undefined,
      template_used: status === 'arrived' ? 'driver_arrived' : 'trip_completed',
    }).catch(() => {})
  }

  if (link_code) {
    await markShortLinkUsed(link_code).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
