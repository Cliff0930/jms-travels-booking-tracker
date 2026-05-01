import { createAdminClient } from '@/lib/supabase/server'
import { parseConversation } from '@/lib/gemini/conversation'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import { generateBookingRef } from '@/lib/utils/booking-ref'
import type { ConversationMessage } from '@/types'

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
// Called from the webhook (via after()) for immediate response, and from the
// cron as a backup for any sessions that weren't processed inline.

export async function processConversationSession(
  supabase: ReturnType<typeof createAdminClient>,
  sessionRecord: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString()
  const phone = sessionRecord.phone as string
  const clientId = sessionRecord.client_id as string | null

  // Atomic claim — prevents double-processing if webhook and cron overlap
  const { data: claimed } = await supabase
    .from('conversation_sessions')
    .update({ pending_process: false, updated_at: now })
    .eq('id', sessionRecord.id)
    .eq('pending_process', true)
    .select('id')
    .single()

  if (!claimed) return // another process already claimed it

  if (!clientId) return

  const { data: client } = await supabase
    .from('clients')
    .select('*, company:companies(*), locations:client_locations(*)')
    .eq('id', clientId)
    .single()

  if (!client) return

  const messages = sessionRecord.messages as ConversationMessage[]
  if (!messages.length) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const savedLocations = (client.locations || []) as any[]
  const result = await parseConversation(messages, client, savedLocations)

  // Compute missing mandatory fields from extracted values — never rely on Gemini's arrays
  const actualMissing: string[] = []
  if (!result.extracted.pickup_location) actualMissing.push('pickup_location')
  if (!result.extracted.pickup_date)     actualMissing.push('pickup_date')
  if (!result.extracted.pickup_time)     actualMissing.push('pickup_time')
  const isComplete = actualMissing.length === 0

  console.log(`[conversation] session=${sessionRecord.id} intent=${result.intent} missing=${JSON.stringify(actualMissing)} complete=${isComplete}`)

  // ── Off-topic / enquiry ────────────────────────────────────────────────────
  const intent = result.intent ?? 'booking'
  if (intent === 'enquiry' || intent === 'other') {
    const reply = intent === 'enquiry'
      ? 'For rates and pricing information, please call us at 9845572207. We are happy to help!'
      : 'For any queries or assistance, please call us at 9845572207.'
    await sendWhatsAppMessage({ to: phone, body: reply })
    await supabase.from('conversation_sessions').update({ status: 'complete', updated_at: now }).eq('id', sessionRecord.id)
    return
  }

  if (isComplete) {
    // ── Create booking ─────────────────────────────────────────────────────
    const bookingRef = generateBookingRef()
    const flags: string[] = []
    if (!result.extracted.pickup_location) flags.push('missing_pickup')
    if (!result.extracted.drop_location)   flags.push('missing_drop')
    if (!client.company_id)                flags.push('unknown_company')
    if (result.is_guest_booking)           flags.push('guest_booking')

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

    if ((result.extracted.total_days ?? 1) > 1) {
      await createBookingLegs(supabase, booking.id, result.extracted.pickup_date!, result.extracted.total_days, result.extracted.day_legs)
    }

    await supabase.from('conversation_sessions').update({
      status: 'complete',
      booking_id: booking.id,
      updated_at: now,
    }).eq('id', sessionRecord.id)

    await supabase
      .from('raw_messages')
      .update({ booking_id: booking.id, processed: true, ai_classification: 'booking' })
      .eq('sender_phone', phone)
      .is('booking_id', null)

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
    }
  } else {
    // ── Ask for missing info — deterministic, all fields in ONE message ────
    const reply = buildMissingQuestion(actualMissing, client.name, !!result.extracted.drop_location)
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
    }).eq('id', sessionRecord.id)

    await sendWhatsAppMessage({ to: phone, body: reply })
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function buildMissingQuestion(missing: string[], clientName: string, hasDropLocation = true): string | null {
  if (missing.length === 0) return null

  const hasPL = missing.includes('pickup_location')
  const hasPD = missing.includes('pickup_date')
  const hasPT = missing.includes('pickup_time')
  const name = clientName || 'there'

  let fieldsList: string
  if (hasPL && hasPD && hasPT) {
    fieldsList = hasDropLocation
      ? 'pickup location, date, and time'
      : 'pickup location, drop location, date, and time'
  } else if (hasPL && hasPD) { fieldsList = 'pickup location and date'
  } else if (hasPL && hasPT) { fieldsList = 'pickup location and time'
  } else if (hasPD && hasPT) { fieldsList = 'date and time'
  } else if (hasPL)          { fieldsList = 'pickup location'
  } else if (hasPD)          { fieldsList = 'date'
  } else if (hasPT)          { fieldsList = 'time'
  } else                     { fieldsList = missing.map(f => f.replace(/_/g, ' ')).join(', ') }

  return `Hi ${name}, to complete your booking we need: ${fieldsList}. Please reply with these details and we will confirm right away! — JMS Travels`
}

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
  if (pendingApproval) {
    return `Hi ${clientName}, thank you for your booking request (Ref: ${bookingRef}). Your booking is pending approval from your company. We will confirm once approved. — JMS Travels`
  }

  const lines = [
    `Hi ${clientName}, thank you for your booking request.`,
    ``,
    `We have received your details and will confirm your booking shortly.`,
    `Your reference is ${bookingRef}.`,
    ``,
  ]
  if (extracted.pickup_location) lines.push(`Pickup: ${extracted.pickup_location}`)
  if (extracted.drop_location)   lines.push(`Drop: ${extracted.drop_location}`)
  if (extracted.pickup_date)     lines.push(`Date: ${extracted.pickup_date}`)
  if (extracted.pickup_time)     lines.push(`Time: ${formatTime12h(extracted.pickup_time)}`)
  if (extracted.total_days > 1)  lines.push(`Days: ${extracted.total_days}`)
  if (extracted.special_instructions) lines.push(`Note: ${extracted.special_instructions}`)
  lines.push(``, `— JMS Travels Team`)
  return lines.join('\n')
}

function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

async function createBookingLegs(
  supabase: ReturnType<typeof createAdminClient>,
  bookingId: string,
  startDate: string,
  totalDays: number,
  dayLegs: Array<{ day: number; date: string }>,
) {
  const legs = dayLegs?.length > 0
    ? dayLegs.map(leg => ({ booking_id: bookingId, day_number: leg.day, leg_date: leg.date, leg_status: 'upcoming' }))
    : Array.from({ length: totalDays }, (_, i) => {
        const d = new Date(startDate)
        d.setDate(d.getDate() + i)
        return { booking_id: bookingId, day_number: i + 1, leg_date: d.toISOString().slice(0, 10), leg_status: 'upcoming' }
      })
  if (legs.length > 0) await supabase.from('booking_legs').insert(legs)
}
