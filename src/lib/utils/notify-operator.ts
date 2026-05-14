import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import { sendPushToAll } from '@/lib/utils/push-notify'
import { createAdminClient } from '@/lib/supabase/server'

// channel='alerts' → push + WhatsApp backup (crash alerts, system errors)
// channel='ops'    → push only (booking notifications, morning digest, etc.)
export async function notifyOperator(message: string, channel: 'alerts' | 'ops' = 'alerts'): Promise<void> {
  const title = channel === 'alerts' ? '🔴 CabFlow Alert' : '📋 CabFlow'
  const firstLine = message.split('\n')[0] || message

  // Persist to DB for the notifications page (fire-and-forget)
  void createAdminClient()
    .from('operator_notifications')
    .insert({ title, body: message, channel })
    .then(() => {}, () => {})

  // Push to all subscribed devices (free — always attempt)
  await sendPushToAll(title, firstLine, '/notifications').catch(e =>
    console.error('[notifyOperator] push failed:', e)
  )

  // WhatsApp only for critical alerts — too important to miss if app is closed
  if (channel === 'alerts') {
    const phone = process.env.OPERATOR_WHATSAPP_NUMBER
    if (!phone) {
      console.error('[notifyOperator] No OPERATOR_WHATSAPP_NUMBER — alert only sent via push:', message.slice(0, 120))
      return
    }
    await sendWhatsAppMessage({ to: phone, body: `⚠️ CabFlow\n\n${message}` })
      .catch(e => console.error('[notifyOperator] WhatsApp failed to deliver alert:', e))
  }
}
