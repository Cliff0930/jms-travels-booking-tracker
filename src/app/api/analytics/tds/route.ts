import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function r2(n: number) { return Math.round(n * 100) / 100 }

// Indian FY: April 1 → March 31
function fyBounds(fy: string): { from: string; to: string } {
  const year = parseInt(fy)          // e.g. 2024 → FY 2024-25
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` }
}

function fyLabel(fy: string) {
  const year = parseInt(fy)
  return `FY ${year}-${String(year + 1).slice(2)}`
}

// Determine which FY a date belongs to (based on April start)
function dateToFY(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.getMonth() >= 3 ? String(d.getFullYear()) : String(d.getFullYear() - 1)
}

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)

  // Default to current FY
  const now = new Date()
  const currentFY = now.getMonth() >= 3 ? String(now.getFullYear()) : String(now.getFullYear() - 1)
  const fy = searchParams.get('fy') || currentFY
  const { from, to } = fyBounds(fy)

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, company_id, period_from, period_to, grand_total, tds_amount, status, company:companies!company_id(id, name)')
    .in('status', ['sent', 'paid', 'partially_paid', 'overdue'])
    .gt('tds_amount', 0)
    .gte('period_from', from)
    .lte('period_from', to)
    .order('period_from', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (invoices ?? []).map(inv => {
    const tds     = Number(inv.tds_amount)
    const net     = Number(inv.grand_total)           // already net of TDS
    const gross   = r2(net + tds)                     // pre-TDS billed amount
    const effRate = gross > 0 ? r2((tds / gross) * 100) : 0
    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      company_id: inv.company_id,
      company_name: (inv.company as unknown as { id: string; name: string } | null)?.name ?? 'Unknown',
      period_from: inv.period_from,
      period_to: inv.period_to,
      gross_billed: gross,
      tds_amount: tds,
      net_received: net,
      effective_rate: effRate,
      status: inv.status,
    }
  })

  // Group by company
  const companyMap: Record<string, {
    name: string; gross: number; tds: number; net: number; invoices: typeof rows
  }> = {}

  for (const r of rows) {
    if (!companyMap[r.company_id]) {
      companyMap[r.company_id] = { name: r.company_name, gross: 0, tds: 0, net: 0, invoices: [] }
    }
    companyMap[r.company_id].gross    += r.gross_billed
    companyMap[r.company_id].tds      += r.tds_amount
    companyMap[r.company_id].net      += r.net_received
    companyMap[r.company_id].invoices.push(r)
  }

  const byCompany = Object.entries(companyMap).map(([id, c]) => ({
    company_id: id,
    company_name: c.name,
    invoice_count: c.invoices.length,
    gross_billed: r2(c.gross),
    tds_amount: r2(c.tds),
    net_received: r2(c.net),
    effective_rate: c.gross > 0 ? r2((c.tds / c.gross) * 100) : 0,
    invoices: c.invoices,
  })).sort((a, b) => b.tds_amount - a.tds_amount)

  const totals = {
    invoice_count: rows.length,
    gross_billed:  r2(rows.reduce((s, r) => s + r.gross_billed, 0)),
    tds_amount:    r2(rows.reduce((s, r) => s + r.tds_amount,   0)),
    net_received:  r2(rows.reduce((s, r) => s + r.net_received, 0)),
  }

  // Available FYs (last 3 years)
  const fyOptions = [-2, -1, 0].map(offset => {
    const year = parseInt(currentFY) + offset
    return { value: String(year), label: fyLabel(String(year)) }
  })

  return NextResponse.json({ fy, fyLabel: fyLabel(fy), fyOptions, totals, byCompany })
}
