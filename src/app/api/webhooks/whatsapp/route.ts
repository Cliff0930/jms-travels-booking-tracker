import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { handleApprovalReply } from '@/lib/utils/approval-handler'
import { extractClientInfo } from '@/lib/gemini/extract-client'
import { parseConversation } from '@/lib/gemini/conversation'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import { generateBookingRef } from '@/lib/utils/booking-ref'
import type { Client, ConversationMessage } from '@/types'

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

      // Handle approval/rejection replies first (e.g., "APPROVE BK-2024-0001")
      const handled = await handleApprovalReply(supabase, rawContent, senderPhone, null)
      if (handled) continue

      // Look up known client by phone
      const { data: client } = await supabase
        .from('clients')
        .select('*, company:companies(*), locations:client_locations(*)')
        .eq('primary_phone', senderPhone)
        .single()

      if (client) {
        await handleKnownClientMessage(supabase, client, senderPhone, rawContent, rawMsg.id)
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
          await handleKnownClientMessage(supabase, newClient, senderPhone, rawContent, rawMsg.id)
        }
      } else {
        // No name — ask who they are, mark message as awaiting identity
        await supabase
          .from('raw_messages')
          .update({ ai_classification: 'awaiting_client_info' })
          .eq('id', rawMsg.id)

        await sendWhatsAppMessage({
          to: senderPhone,
          body: `Hi! Thanks for reaching out to JMS Travels.\n\nCould you share your name and company (or reply "personal" if this is a personal booking)? We'll get your cab sorted right away.`,
        })
      }
    }
  } catch (err) {
    console.error('WhatsApp webhook error:', err)
  }

  return NextResponse.json({ ok: true })
}

// ─── KNOWN CLIENT: Conversation Session Flow ─────────────────────────────────

async function handleKnownClientMessage(
  supabase: ReturnType<typeof createAdminClient>,
  client: Client & { locations?: Array<{ id: string; keyword: string; address: string }> },
  senderPhone: string,
  rawContent: string,
  rawMsgId: string,
) {
  const now = new Date().toISOString()

  // Load or create a collecting session for this phone
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
      })
      .select()
      .single()
    session = newSession
  }

  if (!session) return

  // Append client message to session
  const updatedMessages: ConversationMessage[] = [
    ...(session.messages as ConversationMessage[]),
    { role: 'client', content: rawContent, timestamp: now },
  ]

  // Parse the full conversation with Gemini
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const savedLocations = (client.locations || []) as any[]
  const result = await parseConversation(updatedMessages, client, savedLocations)

  if (result.is_complete) {
    // ── All mandatory fields collected → create the booking ──────────────────
    const bookingRef = generateBookingRef()
    const flags: string[] = []
    if (!result.extracted.pickup_location) flags.push('missing_pickup')
    if (!result.extracted.drop_location) flags.push('missing_drop')
    if (!client.company_id) flags.push('unknown_company')
    if (result.is_guest_booking) flags.push('guest_booking')

    const { data: booking } = await supabase
      .from('bookings')
      .insert({
        booking_ref: bookingRef,
        client_id: client.id,
        company_id: client.company_id,
        status: 'draft',
        source: 'whatsapp',
        flags,
        trip_type: result.extracted.trip_type,
        service_type: result.extracted.service_type,
        pickup_location: result.extracted.pickup_location,
        drop_location: result.extracted.drop_location,
        pickup_date: result.extracted.pickup_date,
        pickup_time: result.extracted.pickup_time,
        pax_count: result.extracted.pax_count,
        vehicle_type: result.extracted.vehicle_type,
        guest_name: result.extracted.guest_name,
        guest_phone: result.extracted.guest_phone,
        total_days: result.extracted.total_days ?? 1,
        special_instructions: result.extracted.special_instructions,
        missing_fields: [],
      })
      .select()
      .single()

    if (!booking) return

    await supabase.from('booking_status_history').insert({
      booking_id: booking.id,
      new_status: 'draft',
      changed_by: 'system',
    })

    // Create booking legs for multi-day trips
    if ((result.extracted.total_days ?? 1) > 1) {
      await createBookingLegs(supabase, booking.id, result.extracted.pickup_date!, result.extracted.total_days, result.extracted.day_legs)
    }

    // Link raw message to booking
    await supabase.from('raw_messages').update({ booking_id: booking.id, processed: true }).eq('id', rawMsgId)

    // Mark session as complete
    await supabase.from('conversation_sessions').update({
      status: 'complete',
      booking_id: booking.id,
      messages: updatedMessages,
      extracted: result.extracted,
      missing_fields: [],
      updated_at: now,
    }).eq('id', session.id)

    // Check if company approval is required
    if (client.company_id) {
      const { data: company } = await supabase
        .from('companies')
        .select('approval_required')
        .eq('id', client.company_id)
        .single()

      if (company?.approval_required) {
        await supabase.from('bookings')
          .update({ status: 'pending_approval', approval_status: 'pending' })
          .eq('id', booking.id)
        await supabase.from('booking_status_history').insert({
          booking_id: booking.id, old_status: 'draft', new_status: 'pending_approval', changed_by: 'system',
        })
        await sendWhatsAppMessage({
          to: senderPhone,
          body: buildBookingReceivedMsg(client.name, booking.booking_ref, result.extracted, true),
        })
        return
      }
    }

    // Send booking confirmation
    await sendWhatsAppMessage({
      to: senderPhone,
      body: buildBookingReceivedMsg(client.name, booking.booking_ref, result.extracted, false),
    })

    // Save outbound confirmation to message_logs
    await supabase.from('message_logs').insert({
      booking_id: booking.id,
      client_id: client.id,
      channel: 'whatsapp',
      direction: 'outbound',
      recipient: senderPhone,
      content: buildBookingReceivedMsg(client.name, booking.booking_ref, result.extracted, false),
      template_used: 'booking_received',
      status: 'sent',
    })
  } else {
    // ── Still collecting info → ask next question ────────────────────────────
    const question = result.next_question
    const sessionMessages = question
      ? [...updatedMessages, { role: 'agent' as const, content: question, timestamp: new Date().toISOString() }]
      : updatedMessages

    await supabase.from('conversation_sessions').update({
      messages: sessionMessages,
      extracted: result.extracted,
      missing_fields: result.missing_mandatory,
      updated_at: now,
    }).eq('id', session.id)

    await supabase.from('raw_messages').update({ ai_missing_fields: result.missing_mandatory, processed: false }).eq('id', rawMsgId)

    if (question) {
      await sendWhatsAppMessage({ to: senderPhone, body: question })
    }
  }
}

// ─── BOOKING CONFIRMATION MESSAGE ────────────────────────────────────────────

function buildBookingReceivedMsg(
  clientName: string,
  bookingRef: string,
  extracted: ConversationResult['extracted'],
  pendingApproval: boolean,
): string {
  const tripLabel = extracted.trip_type === 'airport'
    ? 'Airport Transfer'
    : extracted.trip_type === 'outstation'
    ? 'Outstation'
    : 'Local'

  const dateStr = extracted.pickup_date ?? 'TBD'
  const timeStr = extracted.pickup_time
    ? formatTime12h(extracted.pickup_time)
    : 'TBD'

  const lines = [
    `Hi ${clientName}, your booking has been received.`,
    ``,
    `Ref: ${bookingRef}`,
    `Pickup: ${extracted.pickup_location ?? 'TBD'}`,
    extracted.drop_location ? `Drop: ${extracted.drop_location}` : null,
    `Date: ${dateStr}`,
    `Time: ${timeStr}`,
    `Trip: ${tripLabel}`,
    extracted.total_days > 1 ? `Days: ${extracted.total_days}` : null,
    extracted.special_instructions ? `Note: ${extracted.special_instructions}` : null,
    ``,
    pendingApproval
      ? `This booking is pending approval from your company. We will confirm once approved.`
      : `We will share your driver details once assigned. Thank you!`,
  ]

  return lines.filter(l => l !== null).join('\n')
}

function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

// ─── MULTI-DAY BOOKING LEGS ───────────────────────────────────────────────────

async function createBookingLegs(
  supabase: ReturnType<typeof createAdminClient>,
  bookingId: string,
  startDate: string,
  totalDays: number,
  dayLegs: Array<{ day: number; date: string; pickup_time?: string | null; pickup_location?: string | null; drop_location?: string | null }>,
) {
  const legs = []
  if (dayLegs && dayLegs.length > 0) {
    // Use AI-extracted per-day details
    for (const leg of dayLegs) {
      legs.push({
        booking_id: bookingId,
        day_number: leg.day,
        leg_date: leg.date,
        leg_status: 'upcoming',
      })
    }
  } else {
    // Generate consecutive days from start date
    const start = new Date(startDate)
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      legs.push({
        booking_id: bookingId,
        day_number: i + 1,
        leg_date: d.toISOString().slice(0, 10),
        leg_status: 'upcoming',
      })
    }
  }

  if (legs.length > 0) {
    await supabase.from('booking_legs').insert(legs)
  }
}

// ─── UNKNOWN CLIENT: ONBOARDING ───────────────────────────────────────────────

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
    body: `Thanks, ${resolvedName}${companyLine}! Your profile is set up. Now, what can we help you with today?`,
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

// Import type used in buildBookingReceivedMsg signature
type ConversationResult = Awaited<ReturnType<typeof parseConversation>>
