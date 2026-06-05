import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const admin = createAdminClient()
  const { data } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  return data?.role === 'admin'
}

export async function GET(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
        text: { body: 'Test message from JMS Travels — if you see this, WhatsApp sending is working!' },
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
