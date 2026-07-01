import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { createOperatorAppToken } from '@/lib/utils/operator-app-auth'

export async function POST(request: Request) {
  const { email, password } = await request.json() as { email?: string; password?: string }
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({ email, password })
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('user_profiles')
    .select('id, email, name, role')
    .eq('id', authData.user.id)
    .maybeSingle()

  const name = profile?.name || (authData.user.user_metadata?.name as string | undefined) || email.split('@')[0]
  const role = profile?.role || 'operator'

  const token = createOperatorAppToken(authData.user.id, email, name)

  return NextResponse.json({
    token,
    user: { id: authData.user.id, email, name, role },
  })
}
