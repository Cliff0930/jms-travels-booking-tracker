import { createAdminClient } from '@/lib/supabase/server'

// Normalize to E.164 without leading +. Handles 10-digit Indian numbers stored without country code.
function normalizePhone(phone: string): string {
  const stripped = phone.replace(/^\+/, '')
  return /^[6-9]\d{9}$/.test(stripped) ? '91' + stripped : stripped
}

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
  whatsappMessageId?: string
}

// ── WhatsApp Business Template sender ────────────────────────────────────────
// Use this for outbound notifications (confirm, driver assigned, cancel, etc.)
// Templates bypass the 24-hour conversation window — free-form text does not.
// Templates must be registered and approved in Meta Business Manager first.

export interface TemplateParam {
  type: 'text'
  text: string
}

interface TemplateMessage {
  to: string
  templateName: string
  params: string[]
  log?: WhatsAppTextMessage['log']
  fallbackBody?: string
}

export async function sendWhatsAppTemplate({
  to,
  templateName,
  params,
  log,
  fallbackBody,
}: TemplateMessage): Promise<SendResult> {
  const normalizedTo = normalizePhone(to)
  const bodyParameters: TemplateParam[] = params.map(text => ({ type: 'text', text }))

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalizedTo,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en' },
            components: [{ type: 'body', parameters: bodyParameters }],
          },
        }),
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[WhatsApp] Template failed name=${templateName} to=${normalizedTo} status=${res.status}: ${errText}`)

      // Template not approved yet — fall back to free-form text if provided
      if (fallbackBody) {
        console.log(`[WhatsApp] Falling back to free-form text for ${templateName}`)
        return sendWhatsAppMessage({ to, body: fallbackBody, log })
      }
      return { ok: false, error: `Template API ${res.status}: ${errText}` }
    }

    const responseJson = await res.json() as { messages?: Array<{ id: string }> }
    const whatsappMessageId = responseJson.messages?.[0]?.id

    if (log !== undefined) {
      try {
        const supabase = createAdminClient()
        await supabase.from('message_logs').insert({
          channel: 'whatsapp',
          direction: 'outbound',
          recipient: to,
          content: `[template: ${templateName}] ${params.join(' | ')}`,
          booking_id: log.booking_id ?? null,
          client_id: log.client_id ?? null,
          template_used: templateName,
          status: 'sent',
          whatsapp_message_id: whatsappMessageId ?? null,
        })
      } catch { /* non-critical */ }
    }

    return { ok: true, whatsappMessageId }
  } catch (e) {
    console.error(`[WhatsApp] Template network error name=${templateName} to=${normalizedTo}:`, e)
    return { ok: false, error: String(e) }
  }
}

// Send the same message to multiple phones (deduped). Returns array of results.
export async function sendToAll(
  phones: (string | null | undefined)[],
  body: string,
  log?: WhatsAppTextMessage['log']
): Promise<SendResult[]> {
  const unique = [...new Set(phones.filter((p): p is string => !!p))]
  return Promise.all(unique.map(to => sendWhatsAppMessage({ to, body, log })))
}

export async function sendWhatsAppMessage({ to, body, log }: WhatsAppTextMessage): Promise<SendResult> {
  const normalizedTo = normalizePhone(to)
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

    const responseJson = await res.json() as { messages?: Array<{ id: string }> }
    const whatsappMessageId = responseJson.messages?.[0]?.id

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
          whatsapp_message_id: whatsappMessageId ?? null,
        })
      } catch { /* non-critical */ }
    }

    return { ok: true, whatsappMessageId }
  } catch (e) {
    console.error(`[WhatsApp] Network error to=${normalizedTo}:`, e)
    return { ok: false, error: String(e) }
  }
}
