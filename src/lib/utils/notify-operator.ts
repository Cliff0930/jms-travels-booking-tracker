import { sendWhatsAppMessage } from '@/lib/whatsapp/send'

export async function notifyOperator(message: string): Promise<void> {
  const phone = process.env.OPERATOR_WHATSAPP_NUMBER
  if (!phone) {
    console.error('[notifyOperator] OPERATOR_WHATSAPP_NUMBER not set — alert lost:', message.slice(0, 120))
    return
  }
  await sendWhatsAppMessage({ to: phone, body: `⚠️ CabFlow\n\n${message}` })
    .catch(e => console.error('[notifyOperator] Failed to deliver alert:', e))
}
