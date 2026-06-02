import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

async function nextInvoiceNumber(supabase: ReturnType<typeof createAdminClient>): Promise<string> {
  const year = new Date().getFullYear()
  const fy = new Date().getMonth() >= 3 ? `${year}-${String(year + 1).slice(2)}` : `${year - 1}-${String(year).slice(2)}`
  const key = `invoice_last_seq_${fy}`
  const { data: setting } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  const nextSeq = (parseInt(setting?.value ?? '0') + 1)
  await supabase.from('app_settings').upsert({ key, value: String(nextSeq) }, { onConflict: 'key' })
  return `INV-${fy}-${String(nextSeq).padStart(4, '0')}`
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: invoice, error }, { data: lineItems }, { data: payments }] = await Promise.all([
    supabase.from('invoices').select('*, company:companies!company_id(name, gstin, address)').eq('id', id).single(),
    supabase.from('invoice_line_items').select('*').eq('invoice_id', id).order('sort_order', { ascending: true }),
    supabase.from('billing_payments').select('*').eq('invoice_id', id).order('payment_date', { ascending: true }),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  // Fetch tripsheet numbers for each line item via trip_sheet_id
  const sheetIds = (lineItems ?? []).map(li => li.trip_sheet_id).filter(Boolean) as string[]
  const tripsheetMap: Record<string, string | null> = {}
  if (sheetIds.length > 0) {
    const { data: sheets } = await supabase
      .from('trip_sheets')
      .select('id, tripsheet_number')
      .in('id', sheetIds)
    for (const s of sheets ?? []) tripsheetMap[s.id] = s.tripsheet_number ?? null
  }

  const enrichedItems = (lineItems ?? []).map(li => ({
    ...li,
    tripsheet_number: li.trip_sheet_id ? (tripsheetMap[li.trip_sheet_id] ?? null) : null,
  }))

  return NextResponse.json({ ...invoice, line_items: enrichedItems, payments: payments ?? [] })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const supabase = createAdminClient()

  if (body.status === 'sent') {
    if (!body.sent_at) body.sent_at = new Date().toISOString()
    // Assign invoice number when finalising if not already set
    const { data: existing } = await supabase.from('invoices').select('invoice_number').eq('id', id).single()
    if (!existing?.invoice_number) {
      body.invoice_number = await nextInvoiceNumber(supabase)
    }
  }

  const { data, error } = await supabase.from('invoices').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from('invoices').update({ status: 'cancelled' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
