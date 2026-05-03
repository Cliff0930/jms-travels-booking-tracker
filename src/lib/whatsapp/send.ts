import { createAdminClient } from '@/lib/supabase/server'

interface WhatsAppTextMessage {
  to: string
  body: string
  log?: {
    booking_id?: string
    client_id?: string
    template_used?: string
  }
}

export interface SendResult {
  ok: boolean
  error?: string
}

export async function sendWhatsAppMessage({ to, body, log }: WhatsAppTextMessage): Promise<SendResult> {
  const normalizedTo = to.startsWith('+') ? to.slice(1) : to
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalizedTo,
          type: 'text',
          text: { body },
        }),
      }
    )
    if (!res.ok) {
      const errText = await res.text()
      console.error(`[WhatsApp] Send failed to=${normalizedTo} status=${res.status} body=${errText}`)
      return { ok: false, error: `API ${res.status}: ${errText}` }
    }

    // Log to message_logs only when caller opts in — booking routes log manually
    if (log !== undefined) {
      try {
        const supabase = createAdminClient()
        await supabase.from('message_logs').insert({
          channel: 'whatsapp',
          direction: 'outbound',
          recipient: to,
          content: body,
          booking_id: log.booking_id ?? null,
          client_id: log.client_id ?? null,
          template_used: log.template_used ?? null,
          status: 'sent',
        })
      } catch { /* non-critical */ }
    }

    return { ok: true }
  } catch (e) {
    console.error(`[WhatsApp] Network error to=${normalizedTo}:`, e)
    return { ok: false, error: String(e) }
  }
}
