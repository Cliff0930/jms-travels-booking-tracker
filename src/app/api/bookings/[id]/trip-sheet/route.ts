import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('trip_sheets')
    .select('*')
    .eq('booking_id', id)
    .order('created_at', { ascending: true })

  if (error) console.error(`[trip-sheet] query failed booking=${id}:`, error.message)

  // Enrich with leg data for multi-day trips
  const sheets = data || []
  const legIds = sheets.map(s => s.booking_leg_id).filter(Boolean)
  if (legIds.length > 0) {
    const { data: legs } = await supabase
      .from('booking_legs')
      .select('id, day_number, leg_date')
      .in('id', legIds)
    if (legs) {
      const legMap = Object.fromEntries(legs.map(l => [l.id, l]))
      for (const sheet of sheets) {
        sheet.leg = sheet.booking_leg_id ? (legMap[sheet.booking_leg_id] ?? null) : null
      }
    }
  }

  // Attach invoiced flag — true if booking is in any non-cancelled invoice
  let bookingInvoiced = false
  const { data: liRows } = await supabase
    .from('invoice_line_items')
    .select('invoice_id')
    .eq('booking_id', id)
  if (liRows && liRows.length > 0) {
    const invoiceIds = [...new Set(liRows.map((r: { invoice_id: string }) => r.invoice_id))]
    const { data: activeInv } = await supabase
      .from('invoices')
      .select('id')
      .in('id', invoiceIds)
      .in('status', ['sent', 'paid', 'partially_paid', 'overdue'])
      .limit(1)
    bookingInvoiced = !!(activeInv && activeInv.length > 0)
  }
  for (const sheet of sheets) {
    (sheet as Record<string, unknown>).invoiced = bookingInvoiced
  }

  return NextResponse.json(sheets)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  const sheetId = url.searchParams.get('sheetId')
  if (!sheetId) return NextResponse.json({ error: 'sheetId required' }, { status: 400 })

  const supabase = createAdminClient()

  // Block edit if booking is in any active (non-cancelled) invoice
  const { data: liRows } = await supabase
    .from('invoice_line_items')
    .select('invoice_id')
    .eq('booking_id', id)
  if (liRows && liRows.length > 0) {
    const invoiceIds = [...new Set(liRows.map((r: { invoice_id: string }) => r.invoice_id))]
    const { data: activeInv } = await supabase
      .from('invoices')
      .select('id')
      .in('id', invoiceIds)
      .in('status', ['sent', 'paid', 'partially_paid', 'overdue'])
      .limit(1)
    if (activeInv && activeInv.length > 0) {
      return NextResponse.json({ error: 'Tripsheet is locked — cancel the invoice to edit' }, { status: 403 })
    }
  }

  const body = await request.json() as Record<string, unknown>

  const allowed = [
    'tripsheet_number', 'opening_km', 'closing_km', 'manual_opening_time', 'manual_closing_time',
    'toll_amount', 'parking_amount', 'permit_amount', 'bata_driver', 'bata_client',
    'driver_opening_km', 'driver_closing_km', 'driver_opening_time', 'driver_closing_time',
    'driver_toll_amount', 'driver_parking_amount', 'driver_permit_amount',
    'client_opening_km', 'client_closing_km', 'client_opening_time', 'client_closing_time',
    'client_toll_amount', 'client_parking_amount', 'client_permit_amount',
    'trip_opening_date', 'trip_closing_date',
  ]
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) update[key] = body[key] === '' ? null : body[key]
  }

  const { error } = await supabase.from('trip_sheets').update(update).eq('id', sheetId).eq('booking_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // When outstation dates are edited, recalculate and sync total_days on the booking
  if ('trip_opening_date' in update || 'trip_closing_date' in update) {
    const { data: refreshedSheet } = await supabase
      .from('trip_sheets').select('trip_opening_date, trip_closing_date').eq('id', sheetId).single()
    const od = refreshedSheet?.trip_opening_date, cd = refreshedSheet?.trip_closing_date
    if (od && cd) {
      const diffMs = new Date(cd as string).getTime() - new Date(od as string).getTime()
      const days = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1
      if (days > 0) await supabase.from('bookings').update({ total_days: days }).eq('id', id)
    }
  }

  return NextResponse.json({ ok: true })
}
