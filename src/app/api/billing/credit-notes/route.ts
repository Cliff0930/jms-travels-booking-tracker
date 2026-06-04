import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

async function nextCnNumber(supabase: ReturnType<typeof createAdminClient>): Promise<string> {
  const year = new Date().getFullYear()
  const key = `cn_last_seq_${year}`
  const { data: setting } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  const nextSeq = (parseInt(setting?.value ?? '0') + 1)
  await supabase.from('app_settings').upsert({ key, value: String(nextSeq) }, { onConflict: 'key' })
  return `CN-${year}-${String(nextSeq).padStart(4, '0')}`
}

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const invoiceId = searchParams.get('invoice_id')
  const companyId = searchParams.get('company_id')
  const status    = searchParams.get('status')

  let q = supabase
    .from('credit_notes')
    .select('*, company:companies!company_id(name), invoice:invoices!invoice_id(invoice_number)')
    .order('created_at', { ascending: false })

  if (invoiceId) q = q.eq('invoice_id', invoiceId)
  if (companyId) q = q.eq('company_id', companyId)
  if (status)    q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const body = await request.json()

  const { invoice_id, company_id, reason, notes, line_items } = body as {
    invoice_id: string
    company_id: string
    reason: string
    notes?: string
    line_items: {
      booking_id?: string
      booking_ref?: string
      description: string
      amount: number
      cgst_rate: number
      sgst_rate: number
      igst_rate: number
    }[]
  }

  if (!reason?.trim())      return NextResponse.json({ error: 'Reason is required' }, { status: 400 })
  if (!line_items?.length)  return NextResponse.json({ error: 'At least one line item required' }, { status: 400 })

  // Calculate totals
  let subtotal = 0, cgst = 0, sgst = 0, igst = 0
  const enrichedItems = line_items.map((li, i) => {
    const cgst_amount = Number(((li.amount * li.cgst_rate) / 100).toFixed(2))
    const sgst_amount = Number(((li.amount * li.sgst_rate) / 100).toFixed(2))
    const igst_amount = Number(((li.amount * li.igst_rate) / 100).toFixed(2))
    const line_total  = Number((li.amount + cgst_amount + sgst_amount + igst_amount).toFixed(2))
    subtotal += li.amount
    cgst     += cgst_amount
    sgst     += sgst_amount
    igst     += igst_amount
    return { ...li, cgst_amount, sgst_amount, igst_amount, line_total, sort_order: i }
  })
  const total_amount = Number((subtotal + cgst + sgst + igst).toFixed(2))

  const { data: cn, error: cnErr } = await supabase
    .from('credit_notes')
    .insert({
      cn_number:    null,
      invoice_id,
      company_id,
      reason,
      notes:        notes ?? null,
      status:       'draft',
      subtotal:     Number(subtotal.toFixed(2)),
      cgst_amount:  Number(cgst.toFixed(2)),
      sgst_amount:  Number(sgst.toFixed(2)),
      igst_amount:  Number(igst.toFixed(2)),
      total_amount,
    })
    .select()
    .single()

  if (cnErr || !cn) return NextResponse.json({ error: cnErr?.message ?? 'Insert failed' }, { status: 500 })

  const itemRows = enrichedItems.map(li => ({ ...li, credit_note_id: cn.id }))
  const { error: liErr } = await supabase.from('credit_note_line_items').insert(itemRows)
  if (liErr) return NextResponse.json({ error: liErr.message }, { status: 500 })

  return NextResponse.json(cn, { status: 201 })
}
