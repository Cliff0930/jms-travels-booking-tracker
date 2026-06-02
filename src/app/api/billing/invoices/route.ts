import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

async function nextInvoiceNumber(supabase: ReturnType<typeof createAdminClient>): Promise<string> {
  const year = new Date().getFullYear()
  const fy = new Date().getMonth() >= 3 ? `${year}-${String(year + 1).slice(2)}` : `${year - 1}-${String(year).slice(2)}`
  const key = `invoice_last_seq_${fy}`

  // Read current seq
  const { data: setting } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  const nextSeq = (parseInt(setting?.value ?? '0') + 1)

  // Persist incremented seq
  await supabase.from('app_settings').upsert({ key, value: String(nextSeq) }, { onConflict: 'key' })

  return `INV-${fy}-${String(nextSeq).padStart(4, '0')}`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('company_id')
  const status = searchParams.get('status')
  const supabase = createAdminClient()

  // Auto-flag overdue: any sent invoice past its due date → overdue
  await supabase
    .from('invoices')
    .update({ status: 'overdue' })
    .eq('status', 'sent')
    .not('due_date', 'is', null)
    .lt('due_date', new Date().toISOString().slice(0, 10))

  let q = supabase
    .from('invoices')
    .select('*, company:companies!company_id(name)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (companyId) q = q.eq('company_id', companyId)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const body = await request.json() as {
    company_id: string; period_from: string; period_to: string
    subtotal: number; cgst_amount: number; sgst_amount: number; igst_amount: number
    tds_amount: number; grand_total: number; notes?: string; due_date?: string
    reverse_charge?: boolean
    line_items: Record<string, unknown>[]
    created_by?: string
  }

  const invoice_number = await nextInvoiceNumber(supabase)

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      invoice_number,
      company_id: body.company_id,
      period_from: body.period_from,
      period_to: body.period_to,
      subtotal: body.subtotal,
      cgst_amount: body.cgst_amount,
      sgst_amount: body.sgst_amount,
      igst_amount: body.igst_amount,
      tds_amount: body.tds_amount,
      grand_total: body.grand_total,
      balance_due: body.grand_total,
      notes: body.notes ?? null,
      due_date: body.due_date ?? null,
      reverse_charge: body.reverse_charge ?? false,
      created_by: body.created_by ?? null,
    })
    .select()
    .single()

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  if (body.line_items?.length) {
    const items = body.line_items.map((li, i) => ({ ...li, invoice_id: invoice.id, sort_order: i }))
    const { error: liErr } = await supabase.from('invoice_line_items').insert(items)
    if (liErr) {
      console.error('[billing] line items insert failed:', liErr.message)
      // Roll back — delete the invoice header so user can retry cleanly
      await supabase.from('invoices').delete().eq('id', invoice.id)
      return NextResponse.json({ error: `Line items failed: ${liErr.message}` }, { status: 500 })
    }
  }

  return NextResponse.json(invoice)
}
