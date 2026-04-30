import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseConversation } from '@/lib/gemini/conversation'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import { generateBookingRef } from '@/lib/utils/booking-ref'
import type { Client, ConversationMessage } from '@/types'

const SILENCE_WINDOW_MS = 10_000  // 10 seconds — wait for burst messages to settle
const STALE_RETRY_MS   = 3 * 60_000 // 3 minutes — rescue stuck sessions

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createAdminClient()
  const now = Date.now()
  const cutoff = new Date(now - SILENCE_WINDOW_MS).toISOString()
  const staleCutoff = new Date(now - STALE_RETRY_MS).toISOString()

  // Find sessions that are ready to process (quiet for 10+ seconds)
  const { data: pendingSessions } = await supabase
    .from('conversation_sessions')
    .select('*')
    .eq('status', 'collecting')
    .eq('pending_process', true)
    .lte('last_message_at', cutoff)
    .order('last_message_at', { ascending: true })
    .limit(20)

  // Rescue sessions stuck with pending_process=false for more than 3 minutes
  // (happens when a previous cron run crashed mid-processing)
  await supabase
    .from('conversation_sessions')
    .update({ pending_process: true })
    .eq('status', 'collecting')
    .eq('pending_process', false)
    .lte('updated_at', staleCutoff)

  if (!pendingSessions?.length) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  let processed = 0

  for (const session of pendingSessions) {
    try {
      await processSession(supabase, session)
      processed++
    } catch (err) {
      console.error(`[cron] Error processing session ${session.id}:`, String(err))
      // Reset so the next cron run retries instead of leaving it stuck
      await supabase
        .from('conversation_sessions')
        .update({ pending_process: true })
        .eq('id', session.id)
        .eq('status', 'collecting')
    }
  }

  return NextResponse.json({ ok: true, processed })
}

async function processSession(
  supabase: ReturnType<typeof createAdminClient>,
  session: Record<string, unknown>,
) {
  const now = new Date().toISOString()
  const phone = session.phone as string
  const clientId = session.client_id as string | null

  // Mark as not-pending immediately to prevent double-processing
  await supabase
    .from('conversation_sessions')
    .update({ pending_process: false, updated_at: now })
    .eq('id', session.id)

  // Load client with locations
  if (!clientId) return

  const { data: client } = await supabase
    .from('clients')
    .select('*, company:companies(*), locations:client_locations(*)')
    .eq('id', clientId)
    .single()

  if (!client) return

  const messages = session.messages as ConversationMessage[]
  if (!messages.length) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const savedLocations = (client.locations || []) as any[]
  const result = await parseConversation(messages, client, savedLocations)

  // Compute missing mandatory fields from extracted values directly — never trust Gemini's
  // missing_mandatory or is_complete since it sometimes omits fields or marks complete prematurely.
  const actualMissing: string[] = []
  if (!result.extracted.pickup_location) actualMissing.push('pickup_location')
  if (!result.extracted.pickup_date)     actualMissing.push('pickup_date')
  if (!result.extracted.pickup_time)     actualMissing.push('pickup_time')
  const isComplete = actualMissing.length === 0

  console.log(`[cron] session=${session.id} intent=${result.intent} missing=${JSON.stringify(actualMissing)} complete=${isComplete}`)

  // ── Handle enquiry / off-topic ─────────────────────────────────────────────
  const intent = result.intent ?? 'booking'
  if (intent === 'enquiry' || intent === 'other') {
    const offTopicReply = intent === 'enquiry'
      ? 'For rates and pricing information, please call us at 9845572207. We are happy to help!'
      : 'For any queries or assistance with an existing booking, please call us at 9845572207.'
    await sendWhatsAppMessage({ to: phone, body: offTopicReply })
    await supabase.from('conversation_sessions').update({ status: 'complete', updated_at: now }).eq('id', session.id)
    return
  }

  if (isComplete) {
    // ── Create the booking ─────────────────────────────────────────────────
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

    // Create legs for multi-day trips
    if ((result.extracted.total_days ?? 1) > 1) {
      await createBookingLegs(supabase, booking.id, result.extracted.pickup_date!, result.extracted.total_days, result.extracted.day_legs)
    }

    // Mark session complete
    await supabase.from('conversation_sessions').update({
      status: 'complete',
      booking_id: booking.id,
      updated_at: now,
    }).eq('id', session.id)

    // Link all raw_messages for this phone (recent unclaimed) to this booking
    await supabase
      .from('raw_messages')
      .update({ booking_id: booking.id, processed: true, ai_classification: 'booking' })
      .eq('sender_phone', phone)
      .is('booking_id', null)

    // Check for company approval requirement
    let requiresApproval = false
    if (client.company_id) {
      const { data: company } = await supabase
        .from('companies')
        .select('approval_required')
        .eq('id', client.company_id)
        .single()
      if (company?.approval_required) {
        requiresApproval = true
        await supabase.from('bookings')
          .update({ status: 'pending_approval', approval_status: 'pending' })
          .eq('id', booking.id)
        await supabase.from('booking_status_history').insert({
          booking_id: booking.id, old_status: 'draft', new_status: 'pending_approval', changed_by: 'system',
        })
      }
    }

    const confirmMsg = buildConfirmationMsg(client.name, booking.booking_ref, result.extracted, requiresApproval)
    await sendWhatsAppMessage({ to: phone, body: confirmMsg })

    await supabase.from('message_logs').insert({
      booking_id: booking.id,
      client_id: client.id,
      channel: 'whatsapp',
      direction: 'outbound',
      recipient: phone,
      content: confirmMsg,
      template_used: 'booking_received',
      status: 'sent',
    })

    // If a second booking was detected, open a fresh session for it
    if (result.is_new_booking_request) {
      await supabase.from('conversation_sessions').insert({
        phone,
        client_id: client.id,
        status: 'collecting',
        messages: [],
        extracted: {},
        missing_fields: [],
        last_message_at: now,
        pending_process: false,
      })
      // The agent's reply (next_question) has already acknowledged the second booking
    }
  } else {
    // ── Ask for missing info ───────────────────────────────────────────────
    // Build question from actualMissing (computed from extracted values, not Gemini's array)
    const reply = buildMissingQuestion(actualMissing, !!result.extracted.drop_location)
    if (!reply) return

    const updatedMessages: ConversationMessage[] = [
      ...messages,
      { role: 'agent', content: reply, timestamp: now },
    ]

    await supabase.from('conversation_sessions').update({
      messages: updatedMessages,
      extracted: result.extracted,
      missing_fields: actualMissing,
      updated_at: now,
    }).eq('id', session.id)

    await sendWhatsAppMessage({ to: phone, body: reply })
  }
}

// ─── MISSING FIELDS QUESTION — deterministic, always batches all missing ─────
// Computed from extracted values directly — Gemini cannot cause one-at-a-time behaviour.
// hasDropLocation: if false and all 3 mandatory fields are also missing, also ask for drop.

function buildMissingQuestion(missing: string[], hasDropLocation = true): string | null {
  const hasPL = missing.includes('pickup_location')
  const hasPD = missing.includes('pickup_date')
  const hasPT = missing.includes('pickup_time')

  if (hasPL && hasPD && hasPT) {
    // First ask — include drop location hint too so client gives everything at once
    return hasDropLocation
      ? 'To book your cab, could you share the pickup location, date, and time?'
      : 'To book your cab, could you share the pickup location, drop location, date, and time?'
  }
  if (hasPL && hasPD) return 'Where should we pick you up from, and what date?'
  if (hasPL && hasPT) return 'Where should we pick you up from, and what time?'
  if (hasPD && hasPT) return 'What date and time do you need the cab?'
  if (hasPL) return 'Where should we pick you up from?'
  if (hasPD) return 'What date do you need the cab?'
  if (hasPT) return 'What time should we pick you up?'

  if (missing.length > 0)
    return `Could you also confirm: ${missing.map(f => f.replace(/_/g, ' ')).join(', ')}?`

  return null
}

// ─── BOOKING CONFIRMATION MESSAGE ────────────────────────────────────────────

function buildConfirmationMsg(
  clientName: string,
  bookingRef: string,
  extracted: {
    trip_type: string
    pickup_location: string | null
    drop_location: string | null
    pickup_date: string | null
    pickup_time: string | null
    total_days: number
    special_instructions: string | null
  },
  pendingApproval: boolean,
): string {
  const tripLabel =
    extracted.trip_type === 'airport' ? 'Airport Transfer' :
    extracted.trip_type === 'outstation' ? 'Outstation' : 'Local'

  const timeStr = extracted.pickup_time ? formatTime12h(extracted.pickup_time) : 'TBD'

  const lines: string[] = [
    `Hi ${clientName}, your booking has been received.`,
    ``,
    `Ref: ${bookingRef}`,
    `Pickup: ${extracted.pickup_location ?? 'TBD'}`,
  ]
  if (extracted.drop_location) lines.push(`Drop: ${extracted.drop_location}`)
  lines.push(`Date: ${extracted.pickup_date ?? 'TBD'}`)
  lines.push(`Time: ${timeStr}`)
  lines.push(`Trip: ${tripLabel}`)
  if (extracted.total_days > 1) lines.push(`Days: ${extracted.total_days}`)
  if (extracted.special_instructions) lines.push(`Note: ${extracted.special_instructions}`)
  lines.push(``)
  lines.push(
    pendingApproval
      ? `This is pending approval from your company. We will confirm once approved.`
      : `We will share your driver details once assigned. Thank you!`
  )

  return lines.join('\n')
}

function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

// ─── MULTI-DAY LEGS ───────────────────────────────────────────────────────────

async function createBookingLegs(
  supabase: ReturnType<typeof createAdminClient>,
  bookingId: string,
  startDate: string,
  totalDays: number,
  dayLegs: Array<{ day: number; date: string }>,
) {
  const legs = dayLegs?.length > 0
    ? dayLegs.map(leg => ({
        booking_id: bookingId,
        day_number: leg.day,
        leg_date: leg.date,
        leg_status: 'upcoming',
      }))
    : Array.from({ length: totalDays }, (_, i) => {
        const d = new Date(startDate)
        d.setDate(d.getDate() + i)
        return {
          booking_id: bookingId,
          day_number: i + 1,
          leg_date: d.toISOString().slice(0, 10),
          leg_status: 'upcoming',
        }
      })

  if (legs.length > 0) {
    await supabase.from('booking_legs').insert(legs)
  }
}

