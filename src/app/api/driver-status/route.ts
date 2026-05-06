import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyDriverToken } from '@/lib/utils/driver-token'
import { sendToAll } from '@/lib/whatsapp/send'

export async function POST(request: Request) {
  const { booking_id, status, token } = await request.json()
  const supabase = createAdminClient()

  if (!verifyDriverToken(booking_id, status, token)) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients(id, name, primary_phone), driver:drivers(name, phone, vehicle_name, vehicle_number, vehicle_color)')
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

  return NextResponse.json({ ok: true })
}
