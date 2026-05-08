import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  return data?.role === 'admin' ? user : null
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const requestingUser = await requireAdmin()
  if (!requestingUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const raw = await request.json()
  const admin = createAdminClient()

  // Password is stored in Supabase Auth, not user_profiles
  if ('password' in raw) {
    const { password, ...rest } = raw
    const { error: authError } = await admin.auth.admin.updateUserById(id, { password })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })
    if (Object.keys(rest).length === 0) return NextResponse.json({ ok: true })
    // Fall through to update remaining fields in user_profiles
    const { data, error } = await admin
      .from('user_profiles')
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await admin
    .from('user_profiles')
    .update({ ...raw, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const requestingUser = await requireAdmin()
  if (!requestingUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (id === requestingUser.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
