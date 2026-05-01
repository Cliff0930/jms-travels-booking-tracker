import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { handleApprovalReply } from '@/lib/utils/approval-handler'
import { extractClientInfo } from '@/lib/gemini/extract-client'
import { converseBooking, type ConversationResult } from '@/lib/gemini/converse'
import { generateBookingRef } from '@/lib/utils/booking-ref'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import type { Client, ClientLocation } from '@/types'

const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000 // 2 hours

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

      const { data: rawMsg } = await supabase
        .from('raw_messages')
        .insert({ channel: 'whatsapp', sender_phone: senderPhone, sender_name: senderName, raw_content: rawContent })
        .select()
        .single()

      if (!rawMsg) continue

      // Check for APPROVE/REJECT replies first
      const handled = await handleApprovalReply(supabase, rawContent, senderPhone, null)
      if (handled) continue

      // Look up known client
      const { data: client } = await supabase
        .from('clients')
        .select('*, company:companies(*), locations:client_locations(*)')
        .eq('primary_phone', senderPhone)
        .single()

      if (client) {
        await processClientMessage(supabase, client, senderPhone, rawContent, rawMsg.id)
        continue
      }

      // Unknown sender — check if awaiting onboarding reply
      const { data: pendingOnboarding } = await supabase
        .from('raw_messages')
        .select('id')
        .eq('sender_phone', senderPhone)
        .eq('ai_classification', 'awaiting_client_info')
        .order('received_at', { ascending: false })
        .limit(1)
        .single()

      if (pendingOnboarding) {
        await handleOnboardingReply(supabase, senderPhone, senderName, rawContent, rawMsg.id)
        continue
      }

      // First message from unknown sender — try to extract identity
      const clientInfo = await extractClientInfo(rawContent)

      if (clientInfo.name) {
        const newClient = await createClientFromInfo(supabase, senderPhone, senderName, clientInfo)
        if (newClient) {
          await processClientMessage(supabase, newClient, senderPhone, rawContent, rawMsg.id)
        }
      } else {
        // No name found — ask who they are
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

async function processClientMessage(
  supabase: ReturnType<typeof createAdminClient>,
  client: Client & { locations?: ClientLocation[] },
  senderPhone: string,
  rawContent: string,
  rawMsgId: string
) {
  // Find active session (not timed out)
  const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MS).toISOString()

  const { data: activeSession } = await supabase
    .from('conversation_sessions')
    .select('*')
    .eq('phone', senderPhone)
    .in('status', ['collecting', 'awaiting_ack'])
    .gt('last_message_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // If all fields are collected and we're waiting to send the ack —
  // just store this message; the send-ack function will include it as notes
  if (activeSession?.status === 'awaiting_ack') {
    const msgs = [
      ...(activeSession.messages as Array<{ role: string; content: string; timestamp: string }>),
      { role: 'client', content: rawContent, timestamp: new Date().toISOString() },
    ]
    await supabase
      .from('conversation_sessions')
      .update({ messages: msgs, last_message_at: new Date().toISOString() })
      .eq('id', activeSession.id)

    await supabase
      .from('raw_messages')
      .update({ ai_classification: 'booking', processed: true, booking_id: activeSession.booking_id })
      .eq('id', rawMsgId)
    return
  }

  // Get or create session
  let session = activeSession
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
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single()
    session = newSession
  }

  if (!session) return

  // Add this message to the conversation
  const updatedMessages = [
    ...(session.messages as Array<{ role: 'client' | 'agent'; content: string; timestamp: string }>),
    { role: 'client' as const, content: rawContent, timestamp: new Date().toISOString() },
  ]

  // Run conversation LLM with full history
  const savedLocations = client.locations || []
  const result = await converseBooking(updatedMessages, client, savedLocations)

  await supabase
    .from('raw_messages')
    .update({ ai_classification: result.intent, processed: true })
    .eq('id', rawMsgId)

  // Enquiry or other
  if (result.intent === 'enquiry') {
    await sendWhatsAppMessage({
      to: senderPhone,
      body: 'For rates and pricing information, please call us at 9845572207. We are happy to help!',
    })
    await supabase.from('conversation_sessions').delete().eq('id', session.id)
    return
  }

  if (result.intent === 'other') {
    await sendWhatsAppMessage({
      to: senderPhone,
      body: 'For any queries or assistance regarding an existing booking, please call us at 9845572207.',
    })
    return
  }

  // Update session with latest extracted data
  await supabase
    .from('conversation_sessions')
    .update({
      messages: updatedMessages,
      extracted: result.extracted,
      missing_fields: result.missing_mandatory,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', session.id)

  // Still collecting — ask next question
  if (!result.is_complete) {
    if (result.next_question) {
      const agentMsg = { role: 'agent' as const, content: result.next_question, timestamp: new Date().toISOString() }
      await supabase
        .from('conversation_sessions')
        .update({ messages: [...updatedMessages, agentMsg] })
        .eq('id', session.id)
      await sendWhatsAppMessage({ to: senderPhone, body: result.next_question })
    }
    return
  }

  // All fields collected — create booking
  const booking = await createBookingFromResult(supabase, client, result)
  if (!booking) return

  await supabase
    .from('conversation_sessions')
    .update({
      status: 'awaiting_ack',
      booking_id: booking.id,
      completed_at: new Date().toISOString(),
    })
    .eq('id', session.id)

  await supabase
    .from('raw_messages')
    .update({ booking_id: booking.id })
    .eq('id', rawMsgId)

  // Fire-and-forget — send-ack waits 15s then sends acknowledgement
  fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/send-ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: session.id,
      booking_id: booking.id,
      phone: senderPhone,
      client_name: client.name,
    }),
  }).catch(() => {})
}

async function createBookingFromResult(
  supabase: ReturnType<typeof createAdminClient>,
  client: Client,
  result: ConversationResult
) {
  const bookingRef = generateBookingRef()
  const ext = result.extracted
  const totalDays = Math.max(ext.total_days ?? 1, 1)

  const flags: string[] = []
  if (!client.company_id) flags.push('unknown_company')
  if (result.is_guest_booking) flags.push('guest_booking')

  const { data: booking } = await supabase
    .from('bookings')
    .insert({
      booking_ref: bookingRef,
      client_id: client.id,
      company_id: client.company_id ?? null,
      status: 'draft',
      source: 'whatsapp',
      trip_type: ext.trip_type,
      service_type: ext.service_type,
      pickup_location: ext.pickup_location,
      drop_location: ext.drop_location,
      pickup_date: ext.pickup_date,
      pickup_time: ext.pickup_time,
      pax_count: ext.pax_count,
      vehicle_type: ext.vehicle_type,
      guest_name: ext.guest_name,
      guest_phone: ext.guest_phone,
      total_days: totalDays,
      special_instructions: ext.special_instructions,
      flags,
    })
    .select()
    .single()

  if (!booking) return null

  // Create one leg per day for multi-day bookings
  if (totalDays > 1 && ext.pickup_date) {
    const legs = Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(ext.pickup_date!)
      d.setUTCDate(d.getUTCDate() + i)
      return {
        booking_id: booking.id,
        day_number: i + 1,
        leg_date: d.toISOString().slice(0, 10),
        leg_status: 'upcoming',
      }
    })
    await supabase.from('booking_legs').insert(legs)
  }

  await supabase.from('booking_status_history').insert({
    booking_id: booking.id,
    new_status: 'draft',
    changed_by: 'system',
  })

  // Save new location keyword if the LLM detected one
  if (result.new_keyword_detected && client.id) {
    const kw = result.new_keyword_detected
    const addr = result.resolved_keywords?.[kw]
    if (addr) {
      try {
        await supabase
          .from('client_locations')
          .upsert({ client_id: client.id, keyword: kw, address: addr }, { onConflict: 'client_id,keyword' })
      } catch { /* non-critical */ }
    }
  }

  return booking
}

async function handleOnboardingReply(
  supabase: ReturnType<typeof createAdminClient>,
  senderPhone: string,
  senderName: string | undefined,
  replyText: string,
  rawMsgId: string,
) {
  const clientInfo = await extractClientInfo(replyText)
  const resolvedName = clientInfo.name || senderName || 'Unknown'

  await createClientFromInfo(supabase, senderPhone, resolvedName, clientInfo)

  await supabase
    .from('raw_messages')
    .update({ ai_classification: 'onboarding_complete', processed: true })
    .eq('id', rawMsgId)

  const companyLine =
    clientInfo.company_name && !clientInfo.is_personal ? ` (${clientInfo.company_name})` : ''

  await sendWhatsAppMessage({
    to: senderPhone,
    body: `Thanks, ${resolvedName}${companyLine}! Your profile is set up. What cab do you need?`,
  })
}

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
