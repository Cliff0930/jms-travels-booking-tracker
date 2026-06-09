import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: bill, error }, { data: lineItems }] = await Promise.all([
    supabase.from('cash_bills')
      .select('*, client:clients!client_id(name, prefix, designation, primary_phone, primary_email)')
      .eq('id', id).single(),
    supabase.from('cash_bill_line_items').select('*').eq('cash_bill_id', id).order('sort_order', { ascending: true }),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  // Fetch tripsheet numbers
  const sheetIds = (lineItems ?? []).map(li => li.trip_sheet_id).filter(Boolean) as string[]
  const tripsheetMap: Record<string, string | null> = {}
  if (sheetIds.length > 0) {
    const { data: sheets } = await supabase.from('trip_sheets').select('id, tripsheet_number').in('id', sheetIds)
    for (const s of sheets ?? []) tripsheetMap[s.id] = s.tripsheet_number ?? null
  }

  const enrichedItems = (lineItems ?? []).map(li => ({
    ...li,
    tripsheet_number: li.trip_sheet_id ? (tripsheetMap[li.trip_sheet_id] ?? null) : null,
  }))

  return NextResponse.json({ ...bill, line_items: enrichedItems })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('cash_bills').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
