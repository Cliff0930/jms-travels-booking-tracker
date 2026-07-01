import { sendWhatsAppTemplate } from '@/lib/whatsapp/send'
import { sendPushToAll } from '@/lib/utils/push-notify'
import { createAdminClient } from '@/lib/supabase/server'

async function sendOperatorNativePush(title: string, body: string, url: string): Promise<void> {
  const supabase = createAdminClient()
  const { data: rows } = await supabase
    .from('operator_push_tokens')
    .select('expo_push_token')

  if (!rows?.length) return

  const messages = rows.map(({ expo_push_token }) => ({
    to: expo_push_token,
    title,
    body,
    sound: 'default',
    channelId: 'default',
    data: { url },
  }))

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
  })
}

// channel='alerts' → push + WhatsApp backup (crash alerts, system errors)
// channel='ops'    → push only (booking notifications, morning digest, etc.)
export async function notifyOperator(message: string, channel: 'alerts' | 'ops' = 'alerts', url?: string): Promise<void> {
  const title = channel === 'alerts' ? '🔴 CabFlow Alert' : '📋 CabFlow'
  const firstLine = message.split('\n')[0] || message
  const targetUrl = url || '/notifications'

  // Persist to DB for the notifications page (fire-and-forget)
  void createAdminClient()
    .from('operator_notifications')
    .insert({ title, body: message, channel, url: url ?? null })
    .then(() => {}, () => {})

  // Push to web subscribers (browser PWA)
  void sendPushToAll(title, firstLine, targetUrl).catch(e =>
    console.error('[notifyOperator] web push failed:', e)
  )

  // Push to native operator app
  void sendOperatorNativePush(title, firstLine, targetUrl).catch(e =>
    console.error('[notifyOperator] native push failed:', e)
  )

  // WhatsApp only for critical alerts — too important to miss if app is closed
  if (channel === 'alerts') {
    const phone = process.env.OPERATOR_WHATSAPP_NUMBER
    if (!phone) {
      console.error('[notifyOperator] No OPERATOR_WHATSAPP_NUMBER — alert only sent via push:', message.slice(0, 120))
      return
    }
    await sendWhatsAppTemplate({ to: phone, templateName: 'operator_alert', params: [message.slice(0, 900)] })
      .catch(e => console.error('[notifyOperator] WhatsApp failed to deliver alert:', e))
  }
}
