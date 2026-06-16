import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()
  const body = await request.json() as {
    status?: 'outstanding' | 'settled'
    settled_via?: string
    note?: string
  }

  const update: Record<string, unknown> = {}
  if (body.note !== undefined) update.note = body.note
  if (body.status === 'settled') {
    update.status = 'settled'
    update.settled_via = body.settled_via || null
    update.settled_at = new Date().toISOString()
  } else if (body.status === 'outstanding') {
    update.status = 'outstanding'
    update.settled_via = null
    update.settled_at = null
    update.settlement_id = null
  }

  const { data, error } = await supabase
    .from('driver_advances')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from('driver_advances').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
