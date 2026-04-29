import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateBookingRef } from '@/lib/utils/booking-ref'

interface BulkRow {
  client_name?: string
  guest_name?: string
  guest_phone?: string
  pickup_location?: string
  drop_location?: string
  pickup_date?: string
  pickup_time?: string
  pax_count?: string | number
  vehicle_type?: string
  special_instructions?: string
}

export async function POST(request: Request) {
  const supabase = await createAdminClient()
  const { rows } = await request.json() as { rows: BulkRow[] }

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
  }

  const results: { ref: string; status: 'created' | 'error'; error?: string }[] = []

  for (const row of rows) {
    const flags: string[] = []
    if (!row.pickup_location) flags.push('missing_pickup')
    if (!row.pickup_date) flags.push('missing_date')
    if (!row.pickup_time) flags.push('missing_time')
    if (!row.drop_location) flags.push('missing_drop')
    if (row.guest_name && !row.client_name) flags.push('guest_booking')

    const booking_ref = generateBookingRef()

    const { error } = await supabase.from('bookings').insert({
      booking_ref,
      guest_name: row.guest_name || row.client_name || null,
      guest_phone: row.guest_phone || null,
      pickup_location: row.pickup_location || null,
      drop_location: row.drop_location || null,
      pickup_date: row.pickup_date || null,
      pickup_time: row.pickup_time || null,
      pax_count: row.pax_count ? Number(row.pax_count) : null,
      vehicle_type: row.vehicle_type || null,
      special_instructions: row.special_instructions || null,
      status: 'draft',
      source: 'bulk',
      flags,
    })

    if (error) {
      results.push({ ref: booking_ref, status: 'error', error: error.message })
    } else {
      results.push({ ref: booking_ref, status: 'created' })
    }
  }

  const created = results.filter(r => r.status === 'created').length
  return NextResponse.json({ created, total: rows.length, results }, { status: 201 })
}
