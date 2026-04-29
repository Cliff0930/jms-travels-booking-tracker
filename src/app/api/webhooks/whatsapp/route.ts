import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { handleApprovalReply } from '@/lib/utils/approval-handler'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(request: Request) {
  const body = await request.json()
  const supabase = await createAdminClient()

  try {
    const entry = body?.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value
    const messages = value?.messages

    if (!messages?.length) return NextResponse.json({ ok: true })

    for (const message of messages) {
      if (message.type !== 'text') continue

      const senderPhone = message.from
      const rawContent = message.text?.body || ''
      const senderName = value?.contacts?.[0]?.profile?.name

      const { data: rawMsg } = await supabase
        .from('raw_messages')
        .insert({
          channel: 'whatsapp',
          sender_phone: senderPhone,
          sender_name: senderName,
          raw_content: rawContent,
        })
        .select()
        .single()

      if (!rawMsg) continue

      const handled = await handleApprovalReply(supabase, rawContent, senderPhone, null)
      if (handled) continue

      const { data: client } = await supabase
        .from('clients')
        .select('*, company:companies(*), locations:client_locations(*)')
        .eq('primary_phone', senderPhone)
        .single()

      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/parse-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_message_id: rawMsg.id, client, message: rawContent, channel: 'whatsapp' }),
      })
    }
  } catch (err) {
    console.error('WhatsApp webhook error:', err)
  }

  return NextResponse.json({ ok: true })
}
