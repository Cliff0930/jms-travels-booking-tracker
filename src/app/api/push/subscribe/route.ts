import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { endpoint, keys, label } = await request.json()
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint, p256dh: keys.p256dh, auth: keys.auth, user_label: label || null },
    { onConflict: 'endpoint' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const { endpoint } = await request.json()
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })

  const supabase = createAdminClient()
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  return NextResponse.json({ ok: true })
}
