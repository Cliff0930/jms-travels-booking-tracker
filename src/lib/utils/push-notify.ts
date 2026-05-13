import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/server'

let vapidConfigured = false

function ensureVapid() {
  if (vapidConfigured) return
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const email = process.env.VAPID_EMAIL
  if (!pub || !priv || !email) return
  webpush.setVapidDetails(`mailto:${email}`, pub, priv)
  vapidConfigured = true
}

export async function sendPushToAll(title: string, body: string, url = '/bookings'): Promise<void> {
  ensureVapid()
  if (!vapidConfigured) {
    console.warn('[push] VAPID env vars not set — push skipped')
    return
  }

  const supabase = createAdminClient()
  const { data: subs } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth')
  if (!subs?.length) return

  const payload = JSON.stringify({ title, body: body.slice(0, 200), url })
  const expiredIds: string[] = []

  await Promise.allSettled(
    subs.map(async sub => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 410 || status === 404) expiredIds.push(sub.id)
        else console.error('[push] send failed for', sub.endpoint.slice(0, 40), status)
      }
    })
  )

  if (expiredIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', expiredIds)
    console.log('[push] removed', expiredIds.length, 'expired subscription(s)')
  }
}
