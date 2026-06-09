import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, period_from, period_to, due_date, grand_total, amount_paid, balance_due, status, company_id, addressee_name, company:companies!company_id(name, gstin)')
    .in('status', ['sent', 'partially_paid', 'overdue'])
    .gt('balance_due', 0)
    .order('company_id', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type CompanyRow = {
    company_id: string; company_name: string; gstin: string | null
    total_billed: number; total_paid: number; outstanding: number
    current: number; days1_30: number; days31_60: number; days61_90: number; days90plus: number
    invoices: { invoice_number: string | null; period_from: string; period_to: string; due_date: string | null; grand_total: number; amount_paid: number; balance_due: number; status: string; age_days: number }[]
  }

  const companyMap = new Map<string, CompanyRow>()

  for (const inv of (invoices ?? [])) {
    const companyId = inv.company_id ?? 'individual'
    const company = inv.company as { name?: string; gstin?: string | null } | null
    const companyName = company?.name ?? inv.addressee_name ?? 'Individual / Walk-in'
    const gstin = company?.gstin ?? null
    const balance = Number(inv.balance_due ?? 0)

    // Determine due date: use due_date column, else period_to + 30 days
    let dueStr: string | null = inv.due_date ?? null
    if (!dueStr && inv.period_to) {
      const d = new Date(inv.period_to + 'T00:00:00Z')
      d.setDate(d.getDate() + 30)
      dueStr = d.toISOString().slice(0, 10)
    }

    let ageDays = 0
    if (dueStr) {
      const diffMs = new Date(today + 'T00:00:00Z').getTime() - new Date(dueStr + 'T00:00:00Z').getTime()
      ageDays = Math.floor(diffMs / 86400000)
    }

    if (!companyMap.has(companyId)) {
      companyMap.set(companyId, {
        company_id: companyId, company_name: companyName, gstin,
        total_billed: 0, total_paid: 0, outstanding: 0,
        current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0,
        invoices: [],
      })
    }

    const row = companyMap.get(companyId)!
    row.total_billed += Number(inv.grand_total ?? 0)
    row.total_paid  += Number(inv.amount_paid ?? 0)
    row.outstanding += balance

    if (ageDays <= 0)       row.current    += balance
    else if (ageDays <= 30) row.days1_30   += balance
    else if (ageDays <= 60) row.days31_60  += balance
    else if (ageDays <= 90) row.days61_90  += balance
    else                    row.days90plus += balance

    row.invoices.push({
      invoice_number: inv.invoice_number,
      period_from: inv.period_from,
      period_to: inv.period_to,
      due_date: dueStr,
      grand_total: Number(inv.grand_total ?? 0),
      amount_paid: Number(inv.amount_paid ?? 0),
      balance_due: balance,
      status: inv.status,
      age_days: ageDays,
    })
  }

  const result = Array.from(companyMap.values()).sort((a, b) => b.outstanding - a.outstanding)
  return NextResponse.json(result)
}
