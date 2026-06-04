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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: cn, error }, { data: lineItems }] = await Promise.all([
    supabase.from('credit_notes')
      .select('*, company:companies!company_id(name, gstin, address), invoice:invoices!invoice_id(invoice_number, period_from, period_to)')
      .eq('id', id).single(),
    supabase.from('credit_note_line_items').select('*').eq('credit_note_id', id).order('sort_order', { ascending: true }),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ ...cn, line_items: lineItems ?? [] })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const supabase = createAdminClient()

  if (body.action === 'issue') {
    const { data: existing } = await supabase.from('credit_notes').select('cn_number, status').eq('id', id).single()
    if (existing?.status === 'voided') return NextResponse.json({ error: 'Cannot issue a voided credit note' }, { status: 400 })
    const cn_number = existing?.cn_number ?? await nextCnNumber(supabase)
    const { data, error } = await supabase
      .from('credit_notes')
      .update({ status: 'issued', cn_number, issued_at: new Date().toISOString() })
      .eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (body.action === 'void') {
    const { data, error } = await supabase
      .from('credit_notes')
      .update({ status: 'voided' })
      .eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: cn } = await supabase.from('credit_notes').select('status').eq('id', id).single()
  if (cn?.status === 'issued') return NextResponse.json({ error: 'Cannot delete an issued credit note — void it instead' }, { status: 400 })

  const { error } = await supabase.from('credit_notes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
