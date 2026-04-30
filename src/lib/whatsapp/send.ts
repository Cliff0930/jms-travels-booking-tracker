interface WhatsAppTextMessage {
  to: string
  body: string
}

export async function sendWhatsAppMessage({ to, body }: WhatsAppTextMessage): Promise<void> {
  // Strip leading + if present — WhatsApp API expects E.164 without +
  const normalizedTo = to.startsWith('+') ? to.slice(1) : to

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
    throw new Error(`WhatsApp API error ${res.status}: ${errText}`)
  }
}
