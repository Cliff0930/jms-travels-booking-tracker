import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logApiCost, calcGeminiCost } from '@/lib/api-costs'
import { handleApprovalReply } from '@/lib/utils/approval-handler'
import { handleClientChange, handleDisambiguationReply, type PendingAction } from '@/lib/utils/change-handler'
import { extractClientInfo } from '@/lib/gemini/extract-client'
import { converseBooking, type ConversationResult } from '@/lib/gemini/converse'
import { extractBookingFields } from '@/lib/gemini/extract'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import { findOrCreateGuestClient } from '@/lib/utils/guest-client'
import { notifyOperator } from '@/lib/utils/notify-operator'
import { isAfterHours, sendAfterHoursNotices } from '@/lib/utils/after-hours'
import { formatDate, formatTime } from '@/lib/utils/date'
import type { Client, ClientLocation } from '@/types'
import { formalName, extractHonorific } from '@/lib/utils/client-name'

const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000 // 8 hours

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
  // Parse body synchronously — must happen before response is sent
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  // Defer all processing so Meta gets 200 immediately (avoids 20s webhook timeout)
  after(async () => {
    await processWebhook(body)
  })

  return NextResponse.json({ ok: true })
}

async function processWebhook(body: unknown) {
  const supabase = createAdminClient()

  // Kill switch — checked once per webhook call before any Gemini work
  const { data: killSetting } = await supabase.from('app_settings').select('value').eq('key', 'ai_processing_enabled').single()
  const aiEnabled = killSetting?.value !== 'false'

  try {
    const b = body as Record<string, unknown>
    const entry = ((b?.entry as unknown[]) ?? [])[0] as Record<string, unknown> | undefined
    const changes = ((entry?.changes as unknown[]) ?? [])[0] as Record<string, unknown> | undefined
    const value = changes?.value as Record<string, unknown> | undefined

    // Process delivery status updates — Meta sends these when a message fails to deliver
    const statuses = value?.statuses as Array<Record<string, unknown>> | undefined
    if (statuses?.length) {
      for (const s of statuses) {
        const waMessageId = s.id as string | undefined
        const status = s.status as string | undefined
        const errors = s.errors as Array<{ code: number; title: string }> | undefined
        if (!waMessageId || !status) continue

        // Map Meta statuses: 'sent'=accepted, 'delivered'=on device, 'read'=seen, 'failed'=not delivered
        if (status === 'failed') {
          const errorCode = errors?.[0]?.code
          const errorTitle = errors?.[0]?.title || 'Delivery failed'
          console.error(`[WhatsApp] Delivery failed wa_message_id=${waMessageId} code=${errorCode} title=${errorTitle}`)
          // Update message_log by matching the whatsapp_message_id stored when the message was sent
          await supabase
            .from('message_logs')
            .update({ status: 'failed' })
            .eq('whatsapp_message_id', waMessageId)
        } else if (status === 'delivered') {
          await supabase
            .from('message_logs')
            .update({ status: 'delivered' })
            .eq('whatsapp_message_id', waMessageId)
        }
      }
    }

    const messages = value?.messages as Array<Record<string, unknown>> | undefined

    if (!messages?.length) return

    for (const message of messages) {
      if (message.type === 'location') {
        await handleLocationPin(supabase, message)
        continue
      }

      if (message.type !== 'text') continue

      const senderPhone = message.from as string
      const rawContent = (message.text as Record<string, unknown>)?.body as string || ''
      const contacts = value?.contacts as Array<Record<string, unknown>> | undefined
      const senderDisplayName = (contacts?.[0]?.profile as Record<string, unknown> | undefined)?.name as string | undefined

      let rawMsgId: string | undefined
      try {
      const whatsappMessageId = message.id as string | undefined
      const { data: insertedMsg, error: upsertError } = await supabase
        .from('raw_messages')
        .upsert(
          { channel: 'whatsapp', sender_phone: senderPhone, sender_name: senderDisplayName, raw_content: rawContent, whatsapp_message_id: whatsappMessageId },
          { onConflict: 'whatsapp_message_id', ignoreDuplicates: true }
        )
        .select()
        .single()

      let rawMsg = insertedMsg
      if (!rawMsg) {
        // Duplicate message ID — fetch the existing record to check if it was processed
        const { data: existingMsg } = await supabase
          .from('raw_messages')
          .select('id, processed')
          .eq('whatsapp_message_id', whatsappMessageId!)
          .single()

        if (!existingMsg) {
          console.error('[whatsapp-webhook] upsert failed and no existing row found. upsertError:', upsertError, '| messageId:', whatsappMessageId)
          continue
        }
        if (existingMsg.processed) {
          console.log('[whatsapp-webhook] skipping duplicate messageId (already processed):', whatsappMessageId)
          continue
        }
        // First attempt crashed before processing — retry with existing record
        console.log('[whatsapp-webhook] retrying unprocessed duplicate messageId:', whatsappMessageId)
        rawMsg = existingMsg as typeof rawMsg
      }
      rawMsgId = rawMsg?.id

      // Driver check — if the sender is a registered driver, send a generic reply and skip booking flow
      const { data: driver } = await supabase
        .from('drivers')
        .select('id, name')
        .or(`phone.eq.${senderPhone},secondary_phone.eq.${senderPhone}`)
        .limit(1)
        .maybeSingle()

      if (driver) {
        await supabase.from('raw_messages')
          .update({ ai_classification: 'driver_message', processed: true, processed_at: new Date().toISOString() })
          .eq('id', rawMsg.id)
        await sendWhatsAppMessage({
          to: senderPhone,
          body: `Hi ${driver.name}, this is an automated system. For any queries or assistance, please call us at 9845572207.\n\n— JMS Travels`,
          log: {},
        })
        continue
      }

      // Run approval check and client lookup in parallel
      const [handled, { data: client }] = await Promise.all([
        handleApprovalReply(supabase, rawContent, senderPhone, null),
        supabase
          .from('clients')
          .select('*, company:companies!company_id(*), locations:client_locations(*)')
          .eq('primary_phone', senderPhone)
          .single(),
      ])
      if (handled) continue

      if (!aiEnabled) {
        console.log('[whatsapp] AI processing disabled — message stored, skipping Gemini for', senderPhone)
        continue
      }

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
        await handleOnboardingReply(supabase, senderPhone, senderDisplayName, rawContent, rawMsg.id)
        continue
      }

      // First message from unknown sender — try to extract identity
      const clientInfo = await extractClientInfo(rawContent)

      if (clientInfo.name) {
        const newClient = await createClientFromInfo(supabase, senderPhone, senderDisplayName, clientInfo)
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
      } catch (msgErr) {
        console.error('[whatsapp-webhook] per-message error for', senderPhone, msgErr)
        if (rawMsgId) {
          void supabase.from('raw_messages')
            .update({ ai_classification: 'processing_failed' })
            .eq('id', rawMsgId)
            .then(() => {}, () => {})
        }
        await notifyOperator(`🔴 WhatsApp webhook error!\n\nFrom: ${senderPhone}\nError: ${String(msgErr).slice(0, 300)}\n\nCheck Vercel logs.`).catch(() => {})
        await sendWhatsAppMessage({
          to: senderPhone,
          body: `Sorry, we encountered a technical issue. Please try again in a moment or call us at 9845572207.\n\n— JMS Travels`,
          log: {},
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.error('WhatsApp webhook error:', err)
    await notifyOperator(`🔴 WhatsApp webhook crashed!\n\nError: ${String(err).slice(0, 300)}\n\nCheck Vercel logs. Incoming message may not have been processed.`).catch(() => {})
  }
}

async function handleLocationPin(
  supabase: ReturnType<typeof createAdminClient>,
  message: Record<string, unknown>,
) {
  const senderPhone = message.from as string
  const loc = message.location as Record<string, unknown> | undefined
  if (!loc) return

  const lat = loc.latitude as number
  const lng = loc.longitude as number
  const placeName = (loc.name as string | undefined) || ''
  const placeAddress = (loc.address as string | undefined) || ''
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`
  const locationLabel = placeName || placeAddress || ''
  const rawContent = locationLabel ? `${locationLabel}\n${mapsUrl}` : mapsUrl

  // Look up sender as a client (try exact phone first, then without country code)
  let client: { id: string } | null = null
  const { data: c1 } = await supabase.from('clients').select('id').eq('primary_phone', senderPhone).maybeSingle()
  if (c1) {
    client = c1
  } else if (senderPhone.startsWith('91') && senderPhone.length === 12) {
    const bare = senderPhone.slice(2)
    const { data: c2 } = await supabase.from('clients').select('id').eq('primary_phone', bare).maybeSingle()
    if (c2) client = c2
  }

  // Find most recent active booking for this client (within 24h)
  let bookingId: string | null = null
  let bookingRef: string | null = null
  if (client) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recent } = await supabase
      .from('bookings')
      .select('id, booking_ref, pickup_location, pickup_location_url')
      .eq('client_id', client.id)
      .gt('created_at', oneDayAgo)
      .not('status', 'in', '("completed","cancelled")')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recent) {
      bookingId = recent.id
      bookingRef = recent.booking_ref
      const updates: Record<string, string> = { updated_at: new Date().toISOString() }
      if (!recent.pickup_location_url) updates.pickup_location_url = mapsUrl
      if (!recent.pickup_location && locationLabel) updates.pickup_location = locationLabel
      await supabase.from('bookings').update(updates).eq('id', recent.id)
    }
  }

  // Store in raw_messages so it appears in booking detail and contacts list
  try {
    const whatsappMessageId = message.id as string | undefined
    const insertRow = {
      channel: 'whatsapp',
      sender_phone: senderPhone,
      raw_content: rawContent,
      booking_id: bookingId,
      ai_classification: 'location_pin',
      processed: true,
      processed_at: new Date().toISOString(),
      ...(whatsappMessageId ? { whatsapp_message_id: whatsappMessageId } : {}),
    }
    if (whatsappMessageId) {
      await supabase.from('raw_messages').upsert(insertRow, { onConflict: 'whatsapp_message_id', ignoreDuplicates: true })
    } else {
      await supabase.from('raw_messages').insert(insertRow)
    }
  } catch { /* non-critical */ }

  const replyBody = bookingRef
    ? `Thanks! We've saved your location for booking ${bookingRef}. — JMS Travels`
    : `Thanks for sharing your location! For any queries, call us at 9845572207. — JMS Travels`

  await sendWhatsAppMessage({ to: senderPhone, body: replyBody, log: client ? { client_id: client.id } : {} })
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


  // Track whether the client is resuming after a long gap (>2h) within the same session
  const isLongGap = activeSession
    ? (Date.now() - new Date(activeSession.last_message_at).getTime()) > 2 * 60 * 60 * 1000
    : false

  // Get or create session
  let session = activeSession
  if (!session) {
    // Location follow-up check: if no active session but message looks like an address
    // or maps link, check if there's a recent booking to update the pickup_location on.
    const hasMapsUrl = /https?:\/\/(maps\.(app\.goo\.gl|google\.com)|goo\.gl\/maps)/i.test(rawContent)
    const noBookingSignals = !rawContent.match(
      /\b(book(ing)?|cab|car|vehicle|ride|airport|tonight|tomorrow|today|morning|afternoon|evening|am|pm|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|cancel|flight|terminal|modify|change)\b/i
    )
    const isLocationFollowUp = noBookingSignals && (hasMapsUrl || rawContent.trim().split('\n').length <= 5)

    if (isLocationFollowUp) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: recentBooking } = await supabase
        .from('bookings')
        .select('id, booking_ref, pickup_location, pickup_location_url, drop_location, drop_location_url, trip_type')
        .eq('client_id', client.id)
        .gt('created_at', oneDayAgo)
        .in('status', ['pending', 'draft', 'pending_approval'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (recentBooking) {
        const mapsUrl = rawContent.match(/https?:\/\/\S+/)?.[0] ?? ''
        const addressText = rawContent.replace(/https?:\/\/\S+/g, '').replace(/👆|👇|⬇️/g, '').trim()

        // Guard: don't treat questions or action sentences as addresses
        const isQuestionOrAction =
          /^(do |does |can |could |would |should |is |are |was |will |what |how |why |when |where |who |i want|i need|please|thanks|okay|ok\b|hi\b|hello\b)/i.test(addressText) ||
          /\b(cancel|want to cancel|i want to)\b/i.test(addressText)

        // Name + up-pointer pattern: "Dr Kishore Subbiah 👆" or "see above" — update guest_name on the booking
        const UP_POINTER = /👆|as above|refer above|see above|check above|above location|location above|above address|that location|that address|same as above|\^/i
        const nameMatch = addressText.match(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+[A-Za-z ]{2,40}$/i)
        if (nameMatch && UP_POINTER.test(rawContent)) {
          await supabase
            .from('bookings')
            .update({ guest_name: addressText, updated_at: new Date().toISOString() })
            .eq('id', recentBooking.id)
          await sendWhatsAppMessage({
            to: senderPhone,
            body: `Got it, noted ${addressText} for booking ${recentBooking.booking_ref}.`,
            log: { client_id: client.id },
          })
          return
        }
        if (mapsUrl || (addressText.length > 10 && !isQuestionOrAction)) {
          const isDropContext = /\b(drop|destination|to\s*:|dropping|reach|arrive)\b/i.test(rawContent)
          const updates: Record<string, string> = { updated_at: new Date().toISOString() }
          if (isDropContext) {
            if (addressText) updates.drop_location = addressText
            else if (!recentBooking.drop_location) updates.drop_location = mapsUrl
            if (mapsUrl && !recentBooking.drop_location_url) updates.drop_location_url = mapsUrl
          } else {
            if (addressText) updates.pickup_location = addressText
            else if (!recentBooking.pickup_location) updates.pickup_location = mapsUrl
            if (mapsUrl && !recentBooking.pickup_location_url) updates.pickup_location_url = mapsUrl
          }
          await supabase
            .from('bookings')
            .update(updates)
            .eq('id', recentBooking.id)
          await sendWhatsAppMessage({
            to: senderPhone,
            body: `Thanks! The ${isDropContext ? 'drop' : 'pickup'} address for booking ${recentBooking.booking_ref} has been updated.`,
            log: { client_id: client.id },
          })
          return
        }
        if (UP_POINTER.test(rawContent)) {
          // Explicit pointer emoji/phrase with no long address — just acknowledge
          await sendWhatsAppMessage({
            to: senderPhone,
            body: `Got it, location noted for booking ${recentBooking.booking_ref}.`,
            log: { client_id: client.id },
          })
          return
        }
        // No pointer, no address (e.g. "Hi", "Thanks", "OK") — fall through to post-booking handler
      }
    }

    // Post-booking follow-up: client sends a question or extra info within 30 min of booking
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: recentBookingAny } = await supabase
      .from('bookings')
      .select('id, booking_ref, trip_type, special_instructions, pickup_date, pickup_time')
      .eq('client_id', client.id)
      .gt('created_at', thirtyMinsAgo)
      .not('status', 'in', '("completed","cancelled")')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Explicit modify/cancel keywords
    const hasExplicitModifyKeyword = /\b(cancel|modify|change|reschedule|postpone|update booking)\b/i.test(rawContent)
    // Date patterns: DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, DD-MM-YY, YYYY-MM-DD, day names, month names, relative dates
    const hasDatePattern = /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}-\d{2}-\d{2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|today|day after tomorrow|next week|next month|this morning|this afternoon|this evening|right now|asap|immediately|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}|\d{1,2}(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/i.test(rawContent)
    // Time patterns: 9am, 9 AM, 9:00, 9:30 pm, 9.30 am, 09:00
    const hasTimePattern = /\b(\d{1,2}[:.]\d{2}\s*(?:am|pm|hours|hrs)?|\d{1,2}\s*(?:am|pm))\b/i.test(rawContent)

    if (recentBookingAny) {
      const hasFlightInfo = /\b(flight|terminal|gate|airline|pnr|departure|arrival)\b/i.test(rawContent)

      // Flight/travel info → append to special_instructions (takes priority over date/time detection)
      if (hasFlightInfo && !hasExplicitModifyKeyword) {
        const existing = recentBookingAny.special_instructions ?? ''
        const updated = [existing, rawContent.trim()].filter(Boolean).join('\n')
        await supabase
          .from('bookings')
          .update({ special_instructions: updated, updated_at: new Date().toISOString() })
          .eq('id', recentBookingAny.id)
        await sendWhatsAppMessage({
          to: senderPhone,
          body: `Thanks! We've noted those details for booking ${recentBookingAny.booking_ref} and will pass them to your driver. Our team will confirm your booking shortly.`,
          log: { client_id: client.id },
        })
        return
      }

      // Date or time pattern → treat as a correction/modification, fall through to Gemini
      if (!hasExplicitModifyKeyword && !hasDatePattern && !hasTimePattern) {
        // General question or remark after booking — friendly acknowledgment
        await sendWhatsAppMessage({
          to: senderPhone,
          body: `Thanks for your message! Your booking ${recentBookingAny.booking_ref} has been received and our team will confirm it shortly.\n\nIf you have any additional details to add (such as flight number or special instructions), feel free to share them here.`,
          log: { client_id: client.id },
        })
        return
      }
      // Has explicit modify keyword, or a date/time pattern — fall through to Gemini processing
    }

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
    // If the user has abandoned the disambiguation and is requesting a new booking, clear the loop
    const lc = rawContent.toLowerCase()
    const isNewBookingRequest = (
      /\b(book|want a cab|need a cab|i need|i want)\b/.test(lc) &&
      /\b(tomorrow|today|morning|evening|\d+\s*(am|pm)|airport|from|going to|to )\b/.test(lc)
    )
    if (isNewBookingRequest) {
      await supabase.from('conversation_sessions').update({
        extracted: {},
        messages: [],
        last_message_at: new Date().toISOString(),
      }).eq('id', session.id)
      session = { ...session, messages: [], extracted: {} }
      // Fall through to normal Gemini processing below
    } else {
    const { reply, resolved, nextPendingAction } = await handleDisambiguationReply(supabase, client, senderPhone, rawContent, pendingAction)

    if (resolved) {
      await sendWhatsAppMessage({ to: senderPhone, body: reply, log: { client_id: client.id } })
      await supabase.from('conversation_sessions').delete().eq('id', session.id)
    } else if (nextPendingAction) {
      // Transition to next state (e.g. confirmation step) — store new pendingAction directly
      await sendWhatsAppMessage({ to: senderPhone, body: reply, log: { client_id: client.id } })
      await supabase.from('conversation_sessions').update({
        extracted: { pending_action: nextPendingAction },
        last_message_at: new Date().toISOString(),
      }).eq('id', session.id)
    } else {
      // Skip the attempt counter when awaiting a YES/NO confirmation — only unresolvable
      // disambiguation burns attempts
      const isConfirmationPending = !!pendingAction.confirmation_pending
      const attemptCount = isConfirmationPending
        ? (pendingAction.attempt_count ?? 0)
        : (pendingAction.attempt_count ?? 0) + 1
      if (!isConfirmationPending && attemptCount >= 2) {
        await sendWhatsAppMessage({
          to: senderPhone,
          body: `We're sorry we couldn't resolve your query over chat. For immediate assistance, please call us at 9845572207 — our team will be happy to assist you directly.\n\n— JMS Travels`,
          log: { client_id: client.id },
        })
        await supabase.from('conversation_sessions').delete().eq('id', session.id)
      } else {
        await sendWhatsAppMessage({ to: senderPhone, body: reply, log: { client_id: client.id } })
        // Refresh bookings — same ordering and date filter as handleClientChange
        const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const { data: freshBookings } = await supabase
          .from('bookings')
          .select('id, booking_ref, guest_name, pickup_date, pickup_time, pickup_location, drop_location, trip_type, total_days, driver_id, status')
          .eq('client_id', client.id)
          .not('status', 'in', '("completed","cancelled")')
          .or(`pickup_date.is.null,pickup_date.gte.${todayIST}`)
          .order('pickup_date', { ascending: true, nullsFirst: false })
          .order('pickup_time', { ascending: true, nullsFirst: false })
          .limit(10)
        const updatedAction: PendingAction = {
          ...pendingAction,
          attempt_count: attemptCount,
          bookings: freshBookings?.length
            ? freshBookings.map(b => ({
                id: b.id as string,
                booking_ref: b.booking_ref as string,
                guest_name: (b.guest_name as string | null) ?? null,
                pickup_date: (b.pickup_date as string | null) ?? null,
                pickup_time: (b.pickup_time as string | null) ?? null,
                pickup_location: (b.pickup_location as string | null) ?? null,
                drop_location: (b.drop_location as string | null) ?? null,
                trip_type: (b.trip_type as string | null) ?? null,
                total_days: (b.total_days as number | null) ?? null,
                driver_id: (b.driver_id as string | null) ?? null,
                status: b.status as string,
              }))
            : pendingAction.bookings,
        }
        await supabase.from('conversation_sessions').update({
          extracted: { pending_action: updatedAction },
          last_message_at: new Date().toISOString(),
        }).eq('id', session.id)
      }
    }
    return
    } // close else (disambiguation branch)
  } // close if (pendingAction)

  // Add this message to the conversation
  const updatedMessages = [
    ...(session.messages as Array<{ role: 'client' | 'agent'; content: string; timestamp: string }>),
    { role: 'client' as const, content: rawContent, timestamp: new Date().toISOString() },
  ]

  // Bulk booking detection: if 3+ distinct guest phones appear in the conversation,
  // auto-extract all bookings via LLM, create complete ones, notify operator for incomplete
  const fullText = updatedMessages.map(m => m.content).join('\n')
  const allPhones = fullText.match(/\b[6-9]\d{9}\b/g) ?? []
  const uniqueGuestPhones = new Set(allPhones.filter(p => !senderPhone.endsWith(p)))
  if (uniqueGuestPhones.size >= 2) {
    const clientSavedLocs = client.locations ?? []
    const bulkText = updatedMessages.filter(m => m.role === 'client').map(m => m.content).join('\n\n')

    let extraction = null
    try {
      extraction = await extractBookingFields(bulkText, client, clientSavedLocs)
    } catch (err) {
      console.error('[whatsapp] bulk extract error:', String(err))
    }

    const created: string[] = []
    const incomplete: string[] = []

    if (extraction && extraction.bookings.length > 0) {
      for (const bk of extraction.bookings) {
        if (bk.missing_mandatory.length === 0) {
          const mockResult: ConversationResult = {
            intent: 'booking',
            extracted: {
              pickup_location: bk.extracted.pickup_location ?? null,
              drop_location: bk.extracted.drop_location ?? null,
              pickup_date: bk.extracted.pickup_date ?? null,
              pickup_time: bk.extracted.pickup_time ?? null,
              pax_count: bk.extracted.pax_count ?? null,
              vehicle_type: bk.extracted.vehicle_type ?? null,
              guest_name: bk.extracted.guest_name ?? null,
              guest_phone: bk.extracted.guest_phone ?? null,
              trip_type: bk.extracted.trip_type ?? 'local',
              service_type: bk.extracted.service_type ?? 'one_way',
              total_days: bk.extracted.total_days ?? 1,
              special_instructions: bk.extracted.special_instructions ?? null,
              company_mentioned: bk.extracted.company_mentioned ?? null,
              booking_type: (client.company_id ? 'company' : 'personal') as 'company' | 'personal',
            },
            missing_mandatory: [],
            is_complete: true,
            is_new_booking_request: false,
            is_guest_booking: bk.is_guest_booking,
            next_question: null,
            modification_request: null,
            cancel_reason: null,
            target_booking_ref: null,
            new_keyword_detected: null,
            resolved_keywords: {},
            confidence: 1,
          }
          const booking = await createBookingFromResult(supabase, client, mockResult, senderPhone)
          if (booking) {
            const label = bk.extracted.guest_name
              ? `${bk.extracted.guest_name} — ${formatDate(bk.extracted.pickup_date ?? '')} ${bk.extracted.pickup_time ?? ''}`
              : `${formatDate(bk.extracted.pickup_date ?? '')} ${bk.extracted.pickup_time ?? ''}`
            created.push(label)
          }
        } else {
          const label = bk.extracted.guest_name ?? `Trip on ${formatDate(bk.extracted.pickup_date ?? '')}`
          incomplete.push(`${label} — missing: ${bk.missing_mandatory.join(', ')}`)
        }
      }
    }

    // Operator notification with full session text
    const sessionText = updatedMessages.filter(m => m.role === 'client').map(m => m.content).join('\n---\n')
    let opMsg = `📋 Bulk booking request from ${client.name} (${senderPhone})\n\n`
    if (created.length > 0) opMsg += `✅ Auto-created (${created.length}):\n${created.map(s => `• ${s}`).join('\n')}\n\n`
    if (incomplete.length > 0) opMsg += `⚠️ Incomplete — create manually (${incomplete.length}):\n${incomplete.map(s => `• ${s}`).join('\n')}\n\n`
    if (created.length === 0 && incomplete.length === 0) opMsg += `⚠️ Could not parse any bookings — check messages below.\n\n`
    opMsg += `Messages:\n${sessionText.slice(0, 1500)}`
    await notifyOperator(opMsg, 'ops').catch(() => {})

    // Single summary ack to coordinator
    let ack = `Hi ${client.name}, we've received your booking requests`
    if (created.length > 0 && incomplete.length === 0) {
      ack += ` and confirmed all ${created.length}. Drivers will be assigned and you'll receive individual trip details shortly.`
    } else if (created.length > 0) {
      ack += `. ${created.length} confirmed, ${incomplete.length} need more details — our team will follow up.`
    } else {
      ack += ` — thank you! Our team will review and confirm each one individually.`
    }
    ack += `\n\nFor urgent assistance, call 9845572207.\n\n— JMS Travels`

    await sendWhatsAppMessage({ to: senderPhone, body: ack, log: { client_id: client.id } })
    await supabase.from('conversation_sessions').delete().eq('id', session.id)
    return
  }

  // ── Cost protection: per-sender rate limit ───────────────────────────────
  // 15 messages/hour is well above any normal back-and-forth (usually 3-5 turns).
  // Beyond that it's a loop or abuse — skip Gemini and prompt them to call.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: waCount } = await supabase
    .from('raw_messages')
    .select('*', { count: 'exact', head: true })
    .eq('sender_phone', senderPhone)
    .gt('received_at', oneHourAgo)
  if ((waCount ?? 0) >= 15) {
    await sendWhatsAppMessage({
      to: senderPhone,
      body: `We're receiving too many messages right now. For immediate assistance please call us at 9845572207 — our team will sort your booking right away.\n\n— JMS Travels`,
      log: { client_id: client.id },
    })
    await notifyOperator(
      `⚠️ WhatsApp rate limit hit!\n\nPhone: ${senderPhone} (${client.name}) sent 15+ messages in the last hour. Gemini call skipped.\n\nCheck if a real booking was missed.`
    ).catch(() => {})
    return
  }

  // Run conversation LLM with full history
  const savedLocations = client.locations || []
  let result
  try {
    result = await converseBooking(updatedMessages, client, savedLocations)
  } catch (err) {
    console.error('[whatsapp] converseBooking error:', String(err))
    await notifyOperator(
      `🔴 Gemini error — booking NOT created!\n\nFrom: ${client.name} (${senderPhone})\nMessage: ${rawContent.slice(0, 200)}\nError: ${String(err).slice(0, 300)}\n\nCreate this booking manually.`
    ).catch(() => {})
    await sendWhatsAppMessage({
      to: senderPhone,
      body: 'We had a technical issue processing your message. Please try again in a moment, or call us at 9845572207.',
      log: { client_id: client.id },
    })
    return
  }

  await supabase
    .from('raw_messages')
    .update({ ai_classification: result.intent, processed: true, processed_at: new Date().toISOString() })
    .eq('id', rawMsgId)

  // If Gemini detects a new booking starting within an existing session, reset the
  // session so the old booking's partial data doesn't bleed into the new one, then
  // re-run Gemini on just the current message for a clean extraction.
  const priorSessionMessages = session.messages as Array<{ role: 'client' | 'agent'; content: string; timestamp: string }>
  if (result.is_new_booking_request && priorSessionMessages.length > 0) {
    await supabase.from('conversation_sessions').update({
      messages: [],
      extracted: {},
      last_message_at: new Date().toISOString(),
    }).eq('id', session.id)
    const freshMsg = [{ role: 'client' as const, content: rawContent, timestamp: new Date().toISOString() }]
    try {
      result = await converseBooking(freshMsg, client, savedLocations)
    } catch {
      // keep original result if re-run fails
    }
  }

  // Enquiry or other
  if (result.intent === 'enquiry') {
    const sessionMsgsEnq = session.messages as Array<{ role: 'client' | 'agent'; content: string; timestamp: string }>
    // Mid-booking: answer the pricing question but keep the session alive
    if (sessionMsgsEnq.length > 0) {
      const lastAgentMsgEnq = [...sessionMsgsEnq].reverse().find(m => m.role === 'agent')
      const reaskEnq = lastAgentMsgEnq?.content ?? 'Could you share your pickup location, date, and time?'
      const extEnq = (session.extracted as Record<string, unknown>) ?? {}
      const recapLinesEnq: string[] = []
      if (isLongGap) {
        if (extEnq.pickup_date) recapLinesEnq.push(`Date: ${formatDate(extEnq.pickup_date as string)}`)
        if (extEnq.pickup_time) recapLinesEnq.push(`Time: ${formatTime(extEnq.pickup_time as string)}`)
        if (extEnq.pickup_location) recapLinesEnq.push(`Pickup: ${extEnq.pickup_location as string}`)
        if (extEnq.drop_location) recapLinesEnq.push(`Drop: ${extEnq.drop_location as string}`)
      }
      const recapPrefixEnq = recapLinesEnq.length > 0 ? `Welcome back! Here's what I have so far:\n${recapLinesEnq.join('\n')}\n\n` : ''
      await sendWhatsAppMessage({
        to: senderPhone,
        body: `For rates and pricing, please call us at 9845572207.\n\n${recapPrefixEnq}${reaskEnq}`,
        log: { client_id: client.id },
      })
      await supabase.from('conversation_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', session.id)
      return
    }
    await sendWhatsAppMessage({
      to: senderPhone,
      body: 'For rates and pricing information, please call us at 9845572207. We are happy to help!',
      log: { client_id: client.id },
    })
    await supabase.from('conversation_sessions').delete().eq('id', session.id)
    return
  }

  if (result.intent === 'cancel_request' || result.intent === 'modify_request') {
    if (client.client_type === 'guest') {
      const guestBlock = [
        `Hi ${client.name}, modifications and cancellations to bookings arranged on your behalf must be handled through your company administrator or by contacting us directly.`,
        ``,
        `Please reach out to your company admin or call JMS Travels at 9845572207 — our team will be happy to assist you.`,
        ``,
        `If you'd like to arrange a new trip for yourself, please share your travel details and we'll get it sorted right away.`,
      ].join('\n')
      await sendWhatsAppMessage({ to: senderPhone, body: guestBlock, log: { client_id: client.id } })
      await supabase.from('conversation_sessions').delete().eq('id', session.id)
      return
    }

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
    const sessionMessages = session.messages as Array<{ role: 'client' | 'agent'; content: string; timestamp: string }>
    // Mid-booking: re-ask the last question instead of counting against the client
    if (sessionMessages.length > 0) {
      const lastAgentMsg = [...sessionMessages].reverse().find(m => m.role === 'agent')
      const reask = lastAgentMsg?.content ?? 'Could you share your pickup location, date, and time?'
      const extOther = (session.extracted as Record<string, unknown>) ?? {}
      const recapLinesOther: string[] = []
      if (isLongGap) {
        if (extOther.pickup_date) recapLinesOther.push(`Date: ${formatDate(extOther.pickup_date as string)}`)
        if (extOther.pickup_time) recapLinesOther.push(`Time: ${formatTime(extOther.pickup_time as string)}`)
        if (extOther.pickup_location) recapLinesOther.push(`Pickup: ${extOther.pickup_location as string}`)
        if (extOther.drop_location) recapLinesOther.push(`Drop: ${extOther.drop_location as string}`)
      }
      const recapPrefixOther = recapLinesOther.length > 0 ? `Welcome back! Here's what I have so far:\n${recapLinesOther.join('\n')}\n\n` : ''
      await sendWhatsAppMessage({ to: senderPhone, body: `${recapPrefixOther}${reask}`, log: { client_id: client.id } })
      await supabase.from('conversation_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', session.id)
      return
    }
    const extracted = (session.extracted as Record<string, unknown>) ?? {}
    const otherCount = ((extracted.other_count as number) ?? 0) + 1
    if (otherCount >= 2) {
      await sendWhatsAppMessage({
        to: senderPhone,
        body: `We're sorry we couldn't resolve your query over chat. For immediate assistance, please call us at 9845572207 — our team will be happy to assist you directly.\n\n— JMS Travels`,
        log: { client_id: client.id },
      })
      await supabase.from('conversation_sessions').delete().eq('id', session.id)
    } else {
      await sendWhatsAppMessage({
        to: senderPhone,
        body: 'For any queries or assistance regarding an existing booking, please call us at 9845572207.',
        log: { client_id: client.id },
      })
      await supabase.from('conversation_sessions').update({
        extracted: { ...extracted, other_count: otherCount },
        last_message_at: new Date().toISOString(),
      }).eq('id', session.id)
    }
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
      const ext = result.extracted
      const recapLines: string[] = []
      if (isLongGap) {
        if (ext.pickup_date) recapLines.push(`Date: ${formatDate(ext.pickup_date)}`)
        if (ext.pickup_time) recapLines.push(`Time: ${formatTime(ext.pickup_time)}`)
        if (ext.pickup_location) recapLines.push(`Pickup: ${ext.pickup_location}`)
        if (ext.drop_location) recapLines.push(`Drop: ${ext.drop_location}`)
      }
      const outMsg = recapLines.length > 0
        ? `Welcome back! Here's what I have so far:\n${recapLines.join('\n')}\n\n${result.next_question}`
        : result.next_question
      const agentMsg = { role: 'agent' as const, content: outMsg, timestamp: new Date().toISOString() }
      await supabase
        .from('conversation_sessions')
        .update({ messages: [...updatedMessages, agentMsg] })
        .eq('id', session.id)
      await sendWhatsAppMessage({ to: senderPhone, body: outMsg, log: { client_id: client.id } })
    }
    return
  }

  // Duplicate check — same client, same date, same pickup, same time, not yet cancelled/completed
  const dupDate     = result.extracted.pickup_date
  const dupLocation = result.extracted.pickup_location
  const dupTime     = result.extracted.pickup_time
  if (dupDate && dupLocation) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dupQ: any = supabase
      .from('bookings')
      .select('id, booking_ref')
      .eq('client_id', client.id)
      .eq('pickup_date', dupDate)
      .ilike('pickup_location', dupLocation)
      .not('status', 'in', '("cancelled","completed")')
    if (dupTime) dupQ = dupQ.eq('pickup_time', dupTime)
    const { data: dupBooking } = await dupQ.maybeSingle()
    if (dupBooking) {
      await sendWhatsAppMessage({
        to: senderPhone,
        body: `Hi ${client.name}, it looks like this booking already exists — Ref: ${dupBooking.booking_ref}.\n\nIf this is a new booking with different details, please send them again. Otherwise call us at 9845572207.`,
        log: { client_id: client.id },
      })
      await supabase.from('conversation_sessions').delete().eq('id', session.id)
      return
    }
  }

  // Lock session immediately — prevents duplicate bookings if ack send times out
  await supabase
    .from('conversation_sessions')
    .update({ status: 'complete', completed_at: new Date().toISOString() })
    .eq('id', session.id)

  // All fields collected — create booking
  const booking = await createBookingFromResult(supabase, client, result, senderPhone)
  if (!booking) return

  if (result._usage) {
    const { tokens_in, tokens_out } = result._usage
    logApiCost({ booking_id: booking.id, api_type: 'gemini', call_type: 'converse', tokens_in, tokens_out, cost_usd: calcGeminiCost(tokens_in, tokens_out) }).catch(() => {})
  }

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
    const dateStr = formatDate(ext.pickup_date)
    if (!ext.pickup_time) return `Date: ${dateStr}`
    return `Date: ${dateStr}, ${formatTime(ext.pickup_time)}`
  })()

  const ackDetails = [
    `Ref: ${booking.booking_ref}`,
    ackDateLine,
    result.extracted.pickup_location ? `Pickup: ${result.extracted.pickup_location}` : null,
    result.extracted.drop_location ? `Drop: ${result.extracted.drop_location}` : null,
  ].filter(Boolean).join('\n')

  const waClientName = formalName(client.name, client.salutation, (client.company as import('@/types').Company | null)?.formal_address)

  const ackBody = needsApproval
    ? [
        `Hi ${waClientName}, we have received your booking request.`,
        ``,
        ackDetails,
        ``,
        `Your company admin has been notified for approval. We will confirm your booking once approved. Thank you for choosing JMS Travels!`,
      ].join('\n')
    : [
        `Hi ${waClientName}, we have received your booking request.`,
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
    notifyOperator([
      `📱 New booking via WhatsApp`,
      `From: ${client.name} (${senderPhone})`,
      `Ref: ${booking.booking_ref}`,
      result.extracted.pickup_date ? `Date: ${result.extracted.pickup_date}${result.extracted.pickup_time ? ` ${result.extracted.pickup_time}` : ''}` : null,
      result.extracted.pickup_location ? `Pickup: ${result.extracted.pickup_location}` : null,
      needsApproval ? '⏳ Pending approval' : '✅ Ready to confirm',
    ].filter(Boolean).join('\n'), 'ops', `/bookings/${booking.id}`),
  ])

  if (isAfterHours()) {
    await sendAfterHoursNotices({
      bookingRef: booking.booking_ref,
      clientName: waClientName,
      phone: senderPhone,
      email: client.primary_email,
    }).catch(() => {})
  }
}

async function createBookingFromResult(
  supabase: ReturnType<typeof createAdminClient>,
  client: Client,
  result: ConversationResult,
  senderPhone?: string
) {
  const ext = result.extracted
  const totalDays = Math.max(ext.total_days ?? 1, 1)

  const flags: string[] = []
  if (result.is_guest_booking) flags.push('guest_booking')
  if (ext.booking_type === 'personal' && client.company_id) flags.push('personal_trip')

  // Cross-channel duplicate guard: same client + same date + same time within 2 hours
  if (ext.pickup_date && ext.pickup_time) {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { data: dupBooking } = await supabase
      .from('bookings')
      .select('id, booking_ref, source')
      .eq('client_id', client.id)
      .eq('pickup_date', ext.pickup_date)
      .eq('pickup_time', ext.pickup_time)
      .in('status', ['draft', 'pending', 'pending_approval'])
      .gt('created_at', twoHoursAgo)
      .maybeSingle()

    if (dupBooking) {
      notifyOperator(
        `⚠️ Duplicate booking blocked!\n\nExisting: ${dupBooking.booking_ref} (via ${dupBooking.source})\nNew attempt via whatsapp from ${senderPhone}\nDate: ${ext.pickup_date} at ${ext.pickup_time}\n\nNo new booking created. Review if intentional.`
      ).catch(() => {})
      return null
    }
  }

  // Strip honorific prefix from guest name before saving
  let guestSalutation: 'sir' | 'madam' | null = null
  if (ext.guest_name) {
    const { cleanName, salutation: sal } = extractHonorific(ext.guest_name)
    ext.guest_name = cleanName
    guestSalutation = sal
  }

  const { data: booking } = await supabase
    .from('bookings')
    .insert({
      client_id: client.id,
      company_id: client.company_id ?? null,
      status: 'draft',
      source: 'whatsapp',
      requested_by: senderPhone ?? null,
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
      special_instructions: ext.special_instructions?.slice(0, 500) ?? null,
      booking_type: ext.booking_type ?? (client.company_id ? 'company' : 'personal'),
      flags,
    })
    .select()
    .single()

  if (!booking) return null

  // Auto-save or reuse guest client record linked to the same company
  if (ext.guest_name) {
    try {
      const guest = await findOrCreateGuestClient(supabase, {
        guestName: ext.guest_name,
        guestPhone: ext.guest_phone,
        companyId: client.company_id ?? null,
        salutation: guestSalutation,
      })
      if (guest) {
        await supabase.from('bookings').update({ guest_client_id: guest.id, guest_name: guest.name }).eq('id', booking.id)
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

  // Possible-duplicate detection — mirrors /api/bookings logic so dashboard warning shows
  // even when booking is created directly (not via the API route)
  if (ext.pickup_date) {
    try {
      const { data: sameDay } = await supabase
        .from('bookings')
        .select('id, flags, booking_ref, guest_name, pickup_location')
        .eq('client_id', client.id)
        .eq('pickup_date', ext.pickup_date)
        .not('status', 'in', '("cancelled","completed")')
        .neq('id', booking.id)

      const guestFirst = ext.guest_name?.toLowerCase().split(' ')[0] ?? ''
      const locFirst   = ext.pickup_location?.toLowerCase().split(' ').slice(0, 3).join(' ') ?? ''

      const matches = (sameDay ?? []).filter(s => {
        if (guestFirst && s.guest_name?.toLowerCase().includes(guestFirst)) return true
        if (locFirst   && s.pickup_location?.toLowerCase().includes(locFirst)) return true
        return false
      })

      if (matches.length > 0) {
        await supabase.from('bookings')
          .update({ flags: [...(booking.flags as string[] || []), 'possible_duplicate'] })
          .eq('id', booking.id)
        for (const m of matches) {
          const mFlags = (m.flags as string[] | null) ?? []
          if (!mFlags.includes('possible_duplicate')) {
            await supabase.from('bookings').update({ flags: [...mFlags, 'possible_duplicate'] }).eq('id', m.id)
          }
        }
      }
    } catch { /* non-critical */ }
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

  const newClient = await createClientFromInfo(supabase, senderPhone, resolvedName, clientInfo)
  if (!newClient) return

  // Mark ALL awaiting_client_info messages from this sender as done (not just the
  // current reply) — prevents stale records from re-triggering onboarding on next message
  await supabase
    .from('raw_messages')
    .update({ ai_classification: 'onboarding_complete', processed: true, processed_at: new Date().toISOString() })
    .eq('sender_phone', senderPhone)
    .in('ai_classification', ['awaiting_client_info', 'onboarding_complete'])

  // Process as a booking message — handles the common case where the client included
  // booking details in their identity reply (or the original first message had details)
  await processClientMessage(supabase, newClient, senderPhone, replyText, rawMsgId)
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
      .maybeSingle()

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

  // Check if client already exists (e.g. from a webhook retry or prior partial run)
  const { data: existingClient } = await supabase
    .from('clients')
    .select('*, company:companies!company_id(*), locations:client_locations(*)')
    .eq('primary_phone', senderPhone)
    .single()

  if (existingClient) return existingClient

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
    .select('*, company:companies!company_id(*), locations:client_locations(*)')
    .single()

  return newClient
}
