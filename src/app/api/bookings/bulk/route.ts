import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { TripType } from '@/types'

interface BulkRow {
  guest_name?: string
  guest_phone?: string
  company_name?: string
  booking_type?: string
  trip_type?: string
  total_days?: string | number
  pickup_location?: string
  drop_location?: string
  pickup_date?: string
  pickup_time?: string
  pax_count?: string | number
  vehicle_type?: string
  special_instructions?: string
}

function parseTripType(val?: string): TripType {
  const v = (val ?? '').toLowerCase().trim()
  if (v === 'outstation') return 'outstation'
  if (v === 'airport') return 'airport'
  return 'local'
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const { rows } = await request.json() as { rows: BulkRow[] }

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
  }

  // Pre-fetch all companies once for name matching
  const { data: allCompaniesData } = await supabase
    .from('companies')
    .select('id, name, aliases')
  const allCompanies = allCompaniesData ?? []

  function lookupCompany(name: string): string | null {
    if (!name?.trim()) return null
    const q = name.trim().toLowerCase()
    const match = allCompanies.find(c =>
      c.name.toLowerCase() === q ||
      (Array.isArray(c.aliases) && c.aliases.some((a: string) => a.toLowerCase() === q))
    )
    return match?.id ?? null
  }

  const results: { ref: string; status: 'created' | 'error'; error?: string }[] = []

  for (const row of rows) {
    const trip_type = parseTripType(row.trip_type)
    const total_days = Math.max(1, parseInt(String(row.total_days ?? '1')) || 1)
    const company_id = lookupCompany(row.company_name ?? '')

    const booking_type = (() => {
      const v = (row.booking_type ?? '').toLowerCase().trim()
      if (v === 'personal') return 'personal'
      if (v === 'company') return 'company'
      return company_id ? 'company' : null
    })()

    const flags: string[] = []
    if (!row.pickup_location) flags.push('missing_pickup')
    if (!row.pickup_date)     flags.push('missing_date')
    if (!row.pickup_time)     flags.push('missing_time')
    if (!row.drop_location)   flags.push('missing_drop')
    if (row.guest_name && !company_id) flags.push('guest_booking')
    if (trip_type === 'outstation' && total_days <= 1) flags.push('missing_days')
    if (row.company_name && !company_id) flags.push('company_not_found')

    const { data: newBooking, error } = await supabase.from('bookings').insert({
      guest_name: row.guest_name || null,
      guest_phone: row.guest_phone || null,
      company_id,
      booking_type,
      trip_type,
      total_days,
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
    }).select('booking_ref').single()

    if (error) {
      results.push({ ref: row.guest_name || 'unknown', status: 'error', error: error.message })
    } else {
      results.push({ ref: newBooking?.booking_ref ?? 'unknown', status: 'created' })
    }
  }

  const created = results.filter(r => r.status === 'created').length
  return NextResponse.json({ created, total: rows.length, results }, { status: 201 })
}
