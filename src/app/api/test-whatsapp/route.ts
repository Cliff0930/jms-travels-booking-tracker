import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const to = searchParams.get('to')

  if (!to) {
    return NextResponse.json({ error: 'Pass ?to=919380347313 (number with country code, no +)' }, { status: 400 })
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_API_TOKEN

  if (!phoneNumberId || !token) {
    return NextResponse.json({ error: 'WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_API_TOKEN not set in env' }, { status: 500 })
  }

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: 'Test message from CabFlow — if you see this, WhatsApp sending is working!' },
      }),
    })

    const responseBody = await res.json()

    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      phone_number_id: phoneNumberId,
      token_prefix: token.slice(0, 10) + '…',
      response: responseBody,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
