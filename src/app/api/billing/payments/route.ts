import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const invoiceId = searchParams.get('invoice_id')
  const supabase = createAdminClient()

  let q = supabase
    .from('billing_payments')
    .select('*, invoice:invoices!invoice_id(invoice_number, company:companies!company_id(name))')
    .order('payment_date', { ascending: false })
    .limit(200)

  if (invoiceId) q = q.eq('invoice_id', invoiceId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const body = await request.json() as {
    invoice_id: string; amount: number; payment_mode: string
    payment_date: string; reference_number?: string; tds_amount?: number; notes?: string; created_by?: string
  }

  const { data: payment, error } = await supabase
    .from('billing_payments')
    .insert(body)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Recalculate invoice amount_paid and balance_due
  const { data: allPayments } = await supabase
    .from('billing_payments')
    .select('amount, tds_amount')
    .eq('invoice_id', body.invoice_id)

  const totalPaid = (allPayments ?? []).reduce((s, p) => s + Number(p.amount) + Number(p.tds_amount ?? 0), 0)

  const { data: invoice } = await supabase
    .from('invoices')
    .select('grand_total')
    .eq('id', body.invoice_id)
    .single()

  const grandTotal = Number(invoice?.grand_total ?? 0)
  const balanceDue = Math.max(0, grandTotal - totalPaid)
  const newStatus = balanceDue === 0 ? 'paid' : totalPaid > 0 ? 'partially_paid' : 'sent'

  await supabase.from('invoices')
    .update({ amount_paid: totalPaid, balance_due: balanceDue, status: newStatus })
    .eq('id', body.invoice_id)

  return NextResponse.json(payment)
}
