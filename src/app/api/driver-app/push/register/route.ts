import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractDriverToken } from '@/lib/utils/driver-app-auth'

export async function POST(request: Request) {
  const verified = extractDriverToken(request)
  if (!verified) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { expo_push_token } = await request.json() as { expo_push_token?: string }
  if (!expo_push_token || !expo_push_token.startsWith('ExponentPushToken[')) {
    return NextResponse.json({ error: 'Invalid push token' }, { status: 400 })
  }

  const supabase = createAdminClient()
  await supabase
    .from('driver_push_tokens')
    .upsert(
      { driver_id: verified.driverId, expo_push_token },
      { onConflict: 'driver_id,expo_push_token' }
    )

  return NextResponse.json({ ok: true })
}
