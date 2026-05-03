import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name ?? null,
        role: 'viewer',
        is_active: true,
        created_at: user.created_at,
        updated_at: user.created_at,
      })
    }

    return NextResponse.json(profile)
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
