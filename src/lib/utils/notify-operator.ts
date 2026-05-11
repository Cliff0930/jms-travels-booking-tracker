import { sendWhatsAppMessage } from '@/lib/whatsapp/send'

// channel='alerts' → OPERATOR_WHATSAPP_NUMBER (crash alerts, system errors)
// channel='ops'    → OPS_WHATSAPP_NUMBER (booking notifications, morning digest),
//                    falls back to OPERATOR_WHATSAPP_NUMBER if OPS_WHATSAPP_NUMBER not set
export async function notifyOperator(message: string, channel: 'alerts' | 'ops' = 'alerts'): Promise<void> {
  const phone = channel === 'ops'
    ? (process.env.OPS_WHATSAPP_NUMBER || process.env.OPERATOR_WHATSAPP_NUMBER)
    : process.env.OPERATOR_WHATSAPP_NUMBER
  if (!phone) {
    console.error(`[notifyOperator] No phone set for channel=${channel} — alert lost:`, message.slice(0, 120))
    return
  }
  await sendWhatsAppMessage({ to: phone, body: `⚠️ CabFlow\n\n${message}` })
    .catch(e => console.error('[notifyOperator] Failed to deliver alert:', e))
}
