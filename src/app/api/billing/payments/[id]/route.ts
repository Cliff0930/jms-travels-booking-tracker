import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: payment } = await supabase.from('billing_payments').select('invoice_id, amount, tds_amount').eq('id', id).single()
  const { error } = await supabase.from('billing_payments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (payment) {
    const { data: remaining } = await supabase.from('billing_payments').select('amount, tds_amount').eq('invoice_id', payment.invoice_id)
    const totalPaid = (remaining ?? []).reduce((s, p) => s + Number(p.amount) + Number(p.tds_amount ?? 0), 0)
    const { data: invoice } = await supabase.from('invoices').select('grand_total, status').eq('id', payment.invoice_id).single()
    const grandTotal = Number(invoice?.grand_total ?? 0)
    const balanceDue = Math.max(0, grandTotal - totalPaid)
    const newStatus = balanceDue === 0 ? 'paid' : totalPaid > 0 ? 'partially_paid' : (invoice?.status === 'sent' ? 'sent' : 'draft')
    await supabase.from('invoices').update({ amount_paid: totalPaid, balance_due: balanceDue, status: newStatus }).eq('id', payment.invoice_id)
  }

  return NextResponse.json({ ok: true })
}
