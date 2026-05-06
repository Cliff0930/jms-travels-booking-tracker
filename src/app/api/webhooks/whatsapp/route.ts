import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { handleApprovalReply } from '@/lib/utils/approval-handler'
import { handleClientChange, handleDisambiguationReply, type PendingAction } from '@/lib/utils/change-handler'
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

      // Run approval check and client lookup in parallel
      const [handled, { data: client }] = await Promise.all([
        handleApprovalReply(supabase, rawContent, senderPhone, null),
        supabase
          .from('clients')
          .select('*, company:companies(*), locations:client_locations(*)')
          .eq('primary_phone', senderPhone)
          .single(),
      ])
      if (handled) continue

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
          log: {},
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
    .in('status', ['collecting'])
    .gt('last_message_at', cutoff)
    .is('booking_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()


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

  // If a disambiguation is pending, resolve it before running Gemini
  const pendingAction = (session.extracted as Record<string, unknown>)?.pending_action as PendingAction | undefined
  if (pendingAction) {
    const { reply, resolved } = await handleDisambiguationReply(supabase, client, senderPhone, rawContent, pendingAction)
    await sendWhatsAppMessage({ to: senderPhone, body: reply, log: { client_id: client.id } })
    if (resolved) {
      await supabase.from('conversation_sessions').delete().eq('id', session.id)
    }
    return
  }

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
      log: { client_id: client.id },
    })
    await supabase.from('conversation_sessions').delete().eq('id', session.id)
    return
  }

  if (result.intent === 'cancel_request' || result.intent === 'modify_request') {
    const { reply: replyBody, pendingAction: newPending } = await handleClientChange(supabase, client, senderPhone, result)
    await sendWhatsAppMessage({ to: senderPhone, body: replyBody, log: { client_id: client.id } })
    if (newPending) {
      await supabase.from('conversation_sessions').update({
        extracted: { pending_action: newPending },
        last_message_at: new Date().toISOString(),
      }).eq('id', session.id)
    } else {
      await supabase.from('conversation_sessions').delete().eq('id', session.id)
    }
    return
  }

  if (result.intent === 'other') {
    await sendWhatsAppMessage({
      to: senderPhone,
      body: 'For any queries or assistance regarding an existing booking, please call us at 9845572207.',
      log: { client_id: client.id },
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
      await sendWhatsAppMessage({ to: senderPhone, body: result.next_question, log: { client_id: client.id } })
    }
    return
  }

  // Lock session immediately — prevents duplicate bookings if ack send times out
  await supabase
    .from('conversation_sessions')
    .update({ status: 'complete', completed_at: new Date().toISOString() })
    .eq('id', session.id)

  // All fields collected — create booking
  const booking = await createBookingFromResult(supabase, client, result)
  if (!booking) return

  // Determine if approval is needed: company billing + approval_required + client not excluded
  const company = client.company as (typeof client.company & { approval_exclusions?: string[] }) | null
  const bookingType = result.extracted.booking_type ?? 'company'
  const isPersonal = bookingType === 'personal'
  const exclusions: string[] = company?.approval_exclusions ?? []
  const isExcluded = exclusions.includes(client.id)
  const needsApproval = !isPersonal && !!client.company_id && company?.approval_required === true && !isExcluded

  if (needsApproval) {
    await supabase
      .from('bookings')
      .update({ status: 'pending_approval', approval_status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', booking.id)
    // Fire approval request to company admins in background
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/bookings/${booking.id}/send-approval`, {
      method: 'POST',
    }).catch(() => {})
  }

  // Format date and time for the ack message
  const ackDateLine = (() => {
    const ext = result.extracted
    if (!ext.pickup_date) return null
    const d = new Date(ext.pickup_date + 'T00:00:00Z')
    const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
    if (!ext.pickup_time) return `Date: ${dateStr}`
    const [hh, mm] = ext.pickup_time.split(':').map(Number)
    const ampm = hh >= 12 ? 'PM' : 'AM'
    const h12 = hh % 12 || 12
    return `Date: ${dateStr}, ${h12}:${String(mm).padStart(2, '0')} ${ampm}`
  })()

  const ackDetails = [
    `Ref: ${booking.booking_ref}`,
    ackDateLine,
    result.extracted.pickup_location ? `Pickup: ${result.extracted.pickup_location}` : null,
    result.extracted.drop_location ? `Drop: ${result.extracted.drop_location}` : null,
  ].filter(Boolean).join('\n')

  const ackBody = needsApproval
    ? [
        `Hi ${client.name}, we have received your booking request.`,
        ``,
        ackDetails,
        ``,
        `Your company admin has been notified for approval. We will confirm your booking once approved. Thank you for choosing JMS Travels!`,
      ].join('\n')
    : [
        `Hi ${client.name}, we have received your booking request.`,
        ``,
        ackDetails,
        ``,
        `Our team will review and confirm your booking shortly. Thank you for choosing JMS Travels!`,
      ].join('\n')

  const sessionCreatedAt = (session as { created_at?: string }).created_at ?? new Date(0).toISOString()

  await Promise.all([
    supabase
      .from('conversation_sessions')
      .update({ booking_id: booking.id })
      .eq('id', session.id),
    // Link ALL inbound messages from this session to the booking
    supabase
      .from('raw_messages')
      .update({ booking_id: booking.id })
      .eq('sender_phone', senderPhone)
      .gte('received_at', sessionCreatedAt)
      .is('booking_id', null),
    // Link ALL outbound bot replies from this session to the booking
    supabase
      .from('message_logs')
      .update({ booking_id: booking.id })
      .eq('recipient', senderPhone)
      .gte('sent_at', sessionCreatedAt)
      .is('booking_id', null),
    sendWhatsAppMessage({ to: senderPhone, body: ackBody, log: { client_id: client.id, booking_id: booking.id, template_used: 'booking_received' } }),
  ])
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
  if (result.is_guest_booking) flags.push('guest_booking')
  if (ext.booking_type === 'personal' && client.company_id) flags.push('personal_trip')

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
      booking_type: ext.booking_type ?? (client.company_id ? 'company' : 'personal'),
      flags,
    })
    .select()
    .single()

  if (!booking) return null

  // Auto-save guest as a client record linked to the same company
  if (ext.guest_name && ext.guest_phone) {
    try {
      const { data: existingGuest } = await supabase
        .from('clients')
        .select('id')
        .eq('primary_phone', ext.guest_phone)
        .maybeSingle()

      let guestClientId = existingGuest?.id

      if (!guestClientId) {
        const { data: newGuest } = await supabase
          .from('clients')
          .insert({
            name: ext.guest_name,
            primary_phone: ext.guest_phone,
            company_id: client.company_id ?? null,
            client_type: 'guest',
            is_verified: false,
            is_vip: false,
          })
          .select('id')
          .single()
        guestClientId = newGuest?.id
      }

      if (guestClientId) {
        await supabase.from('bookings').update({ guest_client_id: guestClientId }).eq('id', booking.id)
      }
    } catch { /* non-critical — booking still created */ }
  }

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
    await supabase.from('booking_legs').upsert(legs, { onConflict: 'booking_id,day_number' })
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
    log: {},
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
