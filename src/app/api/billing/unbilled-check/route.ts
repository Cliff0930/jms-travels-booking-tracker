import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function monthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function monthStart(dateStr: string): string {
  return dateStr.slice(0, 7) + '-01'
}

function monthEnd(monthStart: string): string {
  const d = new Date(monthStart + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + 1)
  d.setUTCDate(0)
  return d.toISOString().slice(0, 10)
}

export async function GET() {
  const supabase = createAdminClient()

  // cutoff = first day of current month (IST)
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const cutoff = `${nowIST.getUTCFullYear()}-${String(nowIST.getUTCMonth() + 1).padStart(2, '0')}-01`

  // Only run if we are past the 1st (i.e., at least one full month has elapsed)
  // We always show alerts — no grace window
  // Find booking IDs already in any non-cancelled invoice
  const { data: invoicedItems } = await supabase
    .from('invoice_line_items')
    .select('booking_id, invoices!inner(status)')
    .neq('invoices.status', 'cancelled')

  const invoicedIds = new Set<string>((invoicedItems ?? []).map((r: { booking_id: string }) => r.booking_id).filter(Boolean))

  // Find completed corporate bookings from previous complete months
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, pickup_date, company_id, company:companies!company_id(id, name)')
    .eq('status', 'completed')
    .not('company_id', 'is', null)
    .lt('pickup_date', cutoff)
    .order('pickup_date', { ascending: true })

  if (!bookings || bookings.length === 0) return NextResponse.json([])

  // Filter out already-invoiced bookings
  const unbilled = bookings.filter(b => !invoicedIds.has(b.id))

  if (unbilled.length === 0) return NextResponse.json([])

  // Group by company_id + month
  const groups: Record<string, {
    company_id: string
    company_name: string
    month: string
    period_from: string
    period_to: string
    trip_count: number
  }> = {}

  for (const b of unbilled) {
    const company = b.company as { id: string; name: string } | null
    if (!company) continue
    const ms = monthStart(b.pickup_date)
    const key = `${company.id}::${ms}`
    if (!groups[key]) {
      groups[key] = {
        company_id: company.id,
        company_name: company.name,
        month: monthLabel(ms),
        period_from: ms,
        period_to: monthEnd(ms),
        trip_count: 0,
      }
    }
    groups[key].trip_count++
  }

  // Sort: oldest month first, then by company name
  const result = Object.values(groups).sort((a, b) =>
    a.period_from !== b.period_from
      ? a.period_from.localeCompare(b.period_from)
      : a.company_name.localeCompare(b.company_name)
  )

  return NextResponse.json(result)
}
