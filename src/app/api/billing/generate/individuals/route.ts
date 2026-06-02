import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const company_id  = searchParams.get('company_id')
  const period_from = searchParams.get('period_from')
  const period_to   = searchParams.get('period_to')

  if (!company_id || !period_from || !period_to) {
    return NextResponse.json({ error: 'company_id, period_from, period_to required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Get booking IDs already in any non-cancelled invoice
  const invoicedIds = new Set<string>()
  const { data: finalisedInvs } = await supabase
    .from('invoices').select('id').eq('company_id', company_id)
    .not('status', 'eq', 'cancelled')
  if (finalisedInvs && finalisedInvs.length > 0) {
    const { data: invoicedItems } = await supabase
      .from('invoice_line_items').select('booking_id')
      .in('invoice_id', finalisedInvs.map(i => i.id))
    for (const item of invoicedItems ?? []) {
      if (item.booking_id) invoicedIds.add(item.booking_id)
    }
  }

  // Find completed bookings for this company in the period with a linked guest client
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, guest_client_id')
    .eq('company_id', company_id)
    .eq('status', 'completed')
    .neq('exclude_from_billing', true)
    .not('guest_client_id', 'is', null)
    .gte('pickup_date', period_from)
    .lte('pickup_date', period_to)

  if (!bookings || bookings.length === 0) return NextResponse.json([])

  // Filter out already-invoiced bookings and collect unique guest_client_ids
  const eligibleIds = new Set<string>()
  for (const b of bookings) {
    if (!invoicedIds.has(b.id) && b.guest_client_id) {
      eligibleIds.add(b.guest_client_id)
    }
  }

  if (eligibleIds.size === 0) return NextResponse.json([])

  // Fetch client details
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, prefix, designation, primary_phone')
    .in('id', Array.from(eligibleIds))
    .order('name', { ascending: true })

  return NextResponse.json(clients ?? [])
}
