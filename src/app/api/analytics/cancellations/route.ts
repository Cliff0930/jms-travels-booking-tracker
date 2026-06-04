import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function pad(n: number) { return String(n).padStart(2, '0') }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)

  const now = new Date()
  const defaultFrom = `${now.getFullYear()}-01-01`
  const defaultTo   = fmtDate(now)

  const dateFrom = searchParams.get('date_from') || defaultFrom
  const dateTo   = searchParams.get('date_to')   || defaultTo

  const [
    { data: cancelled },
    { data: allBookings },
  ] = await Promise.all([
    supabase.from('bookings')
      .select('id, booking_ref, booking_type, pickup_date, cancelled_at, cancelled_reason, company_id, driver_id, company:companies!company_id(id, name), driver:drivers!driver_id(id, name)')
      .eq('status', 'cancelled')
      .gte('pickup_date', dateFrom)
      .lte('pickup_date', dateTo)
      .order('pickup_date', { ascending: false }),

    supabase.from('bookings')
      .select('id, status')
      .gte('pickup_date', dateFrom)
      .lte('pickup_date', dateTo),
  ])

  const rows = cancelled ?? []
  const total = rows.length
  const totalBookings = (allBookings ?? []).length
  const cancelRate = totalBookings > 0 ? Math.round((total / totalBookings) * 100) : 0

  // By company
  const companyMap: Record<string, { name: string; count: number }> = {}
  for (const b of rows) {
    const c = b.company as unknown as { id: string; name: string } | null
    if (!c?.id) continue
    if (!companyMap[c.id]) companyMap[c.id] = { name: c.name, count: 0 }
    companyMap[c.id].count++
  }
  const byCompany = Object.entries(companyMap)
    .map(([id, v]) => ({ company_id: id, company_name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count)

  // By driver
  const driverMap: Record<string, { name: string; count: number }> = {}
  for (const b of rows) {
    const d = b.driver as unknown as { id: string; name: string } | null
    if (!d?.id) continue
    if (!driverMap[d.id]) driverMap[d.id] = { name: d.name, count: 0 }
    driverMap[d.id].count++
  }
  const byDriver = Object.entries(driverMap)
    .map(([id, v]) => ({ driver_id: id, driver_name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count)

  // By reason (normalise case, trim)
  const reasonMap: Record<string, number> = {}
  let noReason = 0
  for (const b of rows) {
    const r = (b.cancelled_reason ?? '').toString().trim()
    if (!r) { noReason++; continue }
    const key = r.length > 60 ? r.slice(0, 60) + '…' : r
    reasonMap[key] = (reasonMap[key] ?? 0) + 1
  }
  const byReason = Object.entries(reasonMap)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
  if (noReason > 0) byReason.push({ reason: 'No reason given', count: noReason })

  // By month
  const monthMap: Record<string, number> = {}
  for (const b of rows) {
    const m = (b.pickup_date ?? '').slice(0, 7)
    if (m) monthMap[m] = (monthMap[m] ?? 0) + 1
  }
  const byMonth = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => {
      const [y, m] = month.split('-')
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
      return { month, label, count }
    })

  // By booking type
  const personal = rows.filter(b => b.booking_type !== 'company').length
  const corporate = rows.filter(b => b.booking_type === 'company').length

  // Recent cancellations list
  const recent = rows.slice(0, 30).map(b => ({
    id: b.id,
    booking_ref: b.booking_ref,
    booking_type: b.booking_type,
    pickup_date: b.pickup_date,
    cancelled_at: b.cancelled_at,
    reason: b.cancelled_reason ?? '',
    company_name: (b.company as unknown as { id: string; name: string } | null)?.name ?? null,
    driver_name: (b.driver as unknown as { id: string; name: string } | null)?.name ?? null,
  }))

  return NextResponse.json({
    period: { from: dateFrom, to: dateTo },
    summary: { total, totalBookings, cancelRate, personal, corporate },
    byCompany,
    byDriver: byDriver.slice(0, 10),
    byReason,
    byMonth,
    recent,
  })
}
