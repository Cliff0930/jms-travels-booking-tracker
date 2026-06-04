import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function r2(n: number) { return Math.round(n * 100) / 100 }

function ageDays(dueDateStr: string | null, periodTo: string | null): number {
  const ref = dueDateStr || periodTo
  if (!ref) return 0
  const due = new Date(ref + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - due.getTime()) / 86400000)
}

function bucket(days: number): '0-30' | '31-60' | '61-90' | '90+' {
  if (days <= 30) return '0-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

export async function GET() {
  const supabase = createAdminClient()

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, company_id, period_from, period_to, grand_total, amount_paid, balance_due, status, due_date, created_at, tds_amount, company:companies!company_id(id, name)')
    .in('status', ['sent', 'partially_paid', 'overdue'])
    .gt('balance_due', 0)
    .order('due_date', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (invoices ?? []).map(inv => {
    const days = ageDays(inv.due_date, inv.period_to)
    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      company_id: inv.company_id,
      company_name: (inv.company as unknown as { id: string; name: string } | null)?.name ?? 'Unknown',
      period_from: inv.period_from,
      period_to: inv.period_to,
      grand_total: Number(inv.grand_total),
      amount_paid: Number(inv.amount_paid),
      balance_due: Number(inv.balance_due),
      tds_amount: Number(inv.tds_amount ?? 0),
      status: inv.status,
      due_date: inv.due_date,
      days_overdue: days,
      bucket: bucket(days),
    }
  })

  const total = r2(rows.reduce((s, r) => s + r.balance_due, 0))
  const byBucket = {
    '0-30':  r2(rows.filter(r => r.bucket === '0-30').reduce((s, r) => s + r.balance_due, 0)),
    '31-60': r2(rows.filter(r => r.bucket === '31-60').reduce((s, r) => s + r.balance_due, 0)),
    '61-90': r2(rows.filter(r => r.bucket === '61-90').reduce((s, r) => s + r.balance_due, 0)),
    '90+':   r2(rows.filter(r => r.bucket === '90+').reduce((s, r) => s + r.balance_due, 0)),
  }

  // Per-company roll-up
  const companyMap: Record<string, { name: string; total: number; count: number }> = {}
  for (const r of rows) {
    if (!companyMap[r.company_id]) companyMap[r.company_id] = { name: r.company_name, total: 0, count: 0 }
    companyMap[r.company_id].total += r.balance_due
    companyMap[r.company_id].count++
  }
  const byCompany = Object.values(companyMap)
    .map(c => ({ ...c, total: r2(c.total) }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({ total, byBucket, byCompany, invoices: rows })
}
