import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const body = await request.json()

  const updates: Record<string, unknown> = {}
  if (body.date        !== undefined) updates.date        = body.date
  if (body.category    !== undefined) updates.category    = body.category
  if (body.description !== undefined) updates.description = body.description
  if (body.amount      !== undefined) updates.amount      = body.amount
  if (body.payment_mode !== undefined) updates.payment_mode = body.payment_mode
  if (body.vendor      !== undefined) updates.vendor      = body.vendor
  if (body.reference   !== undefined) updates.reference   = body.reference

  const { data, error } = await supabase
    .from('expenses')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
