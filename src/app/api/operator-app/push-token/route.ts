import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractOperatorToken } from '@/lib/utils/operator-app-auth'

// SQL to run in Supabase before deploying:
// CREATE TABLE operator_push_tokens (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   user_id TEXT NOT NULL,
//   expo_push_token TEXT NOT NULL,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   UNIQUE(user_id, expo_push_token)
// );
// GRANT ALL ON operator_push_tokens TO postgres, anon, authenticated, service_role;
// ALTER TABLE operator_push_tokens ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "service_role_all" ON operator_push_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
// NOTIFY pgrst, 'reload schema';

export async function POST(request: Request) {
  const user = extractOperatorToken(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { expo_push_token?: string }
  if (!body.expo_push_token) {
    return NextResponse.json({ error: 'Missing expo_push_token' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('operator_push_tokens')
    .upsert(
      { user_id: user.userId, expo_push_token: body.expo_push_token },
      { onConflict: 'user_id,expo_push_token' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const user = extractOperatorToken(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { expo_push_token?: string }
  if (!body.expo_push_token) {
    return NextResponse.json({ error: 'Missing expo_push_token' }, { status: 400 })
  }

  const supabase = createAdminClient()
  await supabase
    .from('operator_push_tokens')
    .delete()
    .eq('user_id', user.userId)
    .eq('expo_push_token', body.expo_push_token)

  return NextResponse.json({ ok: true })
}
