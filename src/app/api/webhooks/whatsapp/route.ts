import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { handleApprovalReply } from '@/lib/utils/approval-handler'
import { extractClientInfo } from '@/lib/gemini/extract-client'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import { processConversationSession } from '@/lib/conversation/process'
import type { Client } from '@/types'

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
  const supabase = createAdminClient()

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
      const now = new Date().toISOString()

      // Save every incoming message to raw_messages
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

      // Approval/rejection replies take priority (e.g. "APPROVE BK-2024-0001")
      const handled = await handleApprovalReply(supabase, rawContent, senderPhone, null)
      if (handled) continue

      // Look up known client by phone
      const { data: client } = await supabase
        .from('clients')
        .select('*, company:companies(*), locations:client_locations(*)')
        .eq('primary_phone', senderPhone)
        .single()

      if (client) {
        // Known client — accumulate message in session (processing happens in cron)
        await accumulateMessage(supabase, client, senderPhone, rawContent, rawMsg.id, now)
        continue
      }

      // Unknown sender — check if awaiting onboarding reply
      const { data: pendingOnboarding } = await supabase
        .from('raw_messages')
        .select('id, booking_id')
        .eq('sender_phone', senderPhone)
        .eq('ai_classification', 'awaiting_client_info')
        .order('received_at', { ascending: false })
        .limit(1)
        .single()

      if (pendingOnboarding) {
        await handleOnboardingReply(supabase, senderPhone, senderName, rawContent, rawMsg.id, pendingOnboarding.booking_id)
        continue
      }

      // First message from unknown sender — try to extract identity
      const clientInfo = await extractClientInfo(rawContent)

      if (clientInfo.name) {
        const newClient = await createClientFromInfo(supabase, senderPhone, senderName, clientInfo)
        if (newClient) {
          await accumulateMessage(supabase, newClient, senderPhone, rawContent, rawMsg.id, now)
        }
      } else {
        // No name — ask who they are first
        await supabase
          .from('raw_messages')
          .update({ ai_classification: 'awaiting_client_info' })
          .eq('id', rawMsg.id)

        await sendWhatsAppMessage({
          to: senderPhone,
          body: `Hi! Thanks for reaching out to JMS Travels.\n\nCould you share your name and company (or reply "personal" for a personal booking)? We will get your cab sorted right away.`,
        })
      }
    }
  } catch (err) {
    console.error('WhatsApp webhook error:', err)
  }

  return NextResponse.json({ ok: true })
}

// ─── ACCUMULATE MESSAGE INTO SESSION ────────────────────────────────────────
// Does NOT call Gemini — that happens in the cron job after a 10-second silence window

async function accumulateMessage(
  supabase: ReturnType<typeof createAdminClient>,
  client: Client,
  senderPhone: string,
  content: string,
  rawMsgId: string,
  now: string,
) {
  // Load or create an active collecting session
  let { data: session } = await supabase
    .from('conversation_sessions')
    .select('*')
    .eq('phone', senderPhone)
    .eq('status', 'collecting')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!session) {
    const { data: newSession } = await supabase
      .from('conversation_sessions')
      .insert({
        phone: senderPhone,
        client_id: client.id,
        status: 'collecting',
        messages: [],
        extracted: {},
        missing_fields: [],
        last_message_at: now,
        pending_process: true,
      })
      .select()
      .single()
    session = newSession
  }

  if (!session) return

  // Append this client message
  const updatedMessages = [
    ...(session.messages as Array<{ role: string; content: string; timestamp: string }>),
    { role: 'client', content, timestamp: now },
  ]

  // Mark session as pending with updated timestamp — cron will pick it up after 10s silence
  await supabase
    .from('conversation_sessions')
    .update({
      messages: updatedMessages,
      last_message_at: now,
      pending_process: true,
      updated_at: now,
    })
    .eq('id', session.id)

  // Tag the raw message with the session's client_id (no booking yet)
  await supabase
    .from('raw_messages')
    .update({ processed: false })
    .eq('id', rawMsgId)

  // Process immediately after the webhook responds 200 to WhatsApp.
  // The cron is a safety-net only — this is the primary response path.
  const sessionSnapshot = { ...session, messages: updatedMessages, pending_process: true }
  after(async () => {
    try {
      await processConversationSession(supabase, sessionSnapshot)
    } catch (err) {
      console.error('[webhook] inline process error:', String(err))
    }
  })
}

// ─── ONBOARDING ──────────────────────────────────────────────────────────────

async function handleOnboardingReply(
  supabase: ReturnType<typeof createAdminClient>,
  senderPhone: string,
  senderName: string | undefined,
  replyText: string,
  rawMsgId: string,
  draftBookingId: string | null,
) {
  const clientInfo = await extractClientInfo(replyText)
  const resolvedName = clientInfo.name || senderName || 'Unknown'

  const newClient = await createClientFromInfo(supabase, senderPhone, resolvedName, clientInfo)

  await supabase
    .from('raw_messages')
    .update({ ai_classification: 'onboarding_complete', processed: true })
    .eq('id', rawMsgId)

  if (draftBookingId && newClient) {
    await supabase
      .from('bookings')
      .update({ client_id: newClient.id, company_id: newClient.company_id })
      .eq('id', draftBookingId)
      .eq('status', 'draft')
  }

  const companyLine = clientInfo.company_name && !clientInfo.is_personal
    ? ` (${clientInfo.company_name})`
    : ''

  await sendWhatsAppMessage({
    to: senderPhone,
    body: `Thanks, ${resolvedName}${companyLine}! Your profile is set up. Now, what cab do you need?`,
  })
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function createClientFromInfo(
  supabase: ReturnType<typeof createAdminClient>,
  senderPhone: string,
  displayName: string | null | undefined,
  clientInfo: { name: string | null; company_name: string | null; is_personal: boolean },
) {
  const resolvedName = clientInfo.name || displayName || 'Unknown'
  let companyId: string | null = null

  if (clientInfo.company_name && !clientInfo.is_personal) {
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id')
      .ilike('name', clientInfo.company_name)
      .single()

    if (existingCompany) {
      companyId = existingCompany.id
    } else {
      const { data: newCompany } = await supabase
        .from('companies')
        .insert({
          name: clientInfo.company_name,
          aliases: [],
          email_domains: [],
          approver_emails: [],
          approver_whatsapp: [],
          approval_required: false,
          approval_channel: 'whatsapp',
          approval_timeout_hours: 24,
          digest_mode: false,
        })
        .select('id')
        .single()
      companyId = newCompany?.id || null
    }
  }

  const { data: newClient } = await supabase
    .from('clients')
    .insert({
      name: resolvedName,
      primary_phone: senderPhone,
      company_id: companyId,
      client_type: companyId ? 'corporate' : 'walkin',
      is_verified: false,
      is_vip: false,
    })
    .select('*, company:companies(*), locations:client_locations(*)')
    .single()

  return newClient
}
