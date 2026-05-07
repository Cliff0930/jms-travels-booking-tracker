import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { classifyMessage } from '@/lib/gemini/classify'
import { extractBookingFields } from '@/lib/gemini/extract'
import { generateBookingRef } from '@/lib/utils/booking-ref'
import { fillTemplate, TEMPLATE_KEYS } from '@/lib/templates'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import { sendEmail } from '@/lib/gmail/send'
import type { Client, ClientLocation } from '@/types'

function getTodayIST(): string {
  const istOffset = 5.5 * 60 * 60 * 1000
  return new Date(Date.now() + istOffset).toISOString().slice(0, 10)
}

function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

function buildWhatsAppConfirmation(
  clientName: string,
  bookingRef: string,
  extracted: {
    pickup_location: string | null
    drop_location: string | null
    pickup_date: string | null
    pickup_time: string | null
    trip_type: string
    total_days: number
    special_instructions: string | null
  }
): string {
  const tripLabel: Record<string, string> = { local: 'Local', outstation: 'Outstation', airport: 'Airport' }
  const lines = [
    `Hi ${clientName}, your booking is confirmed.`,
    ``,
    `Ref: ${bookingRef}`,
  ]
  if (extracted.pickup_location) lines.push(`Pickup: ${extracted.pickup_location}`)
  if (extracted.drop_location)   lines.push(`Drop: ${extracted.drop_location}`)
  if (extracted.pickup_date)     lines.push(`Date: ${extracted.pickup_date}`)
  if (extracted.pickup_time)     lines.push(`Time: ${formatTime12h(extracted.pickup_time)}`)
  lines.push(`Trip: ${tripLabel[extracted.trip_type] ?? extracted.trip_type}`)
  if ((extracted.total_days ?? 1) > 1) lines.push(`Days: ${extracted.total_days}`)
  if (extracted.special_instructions) lines.push(`Note: ${extracted.special_instructions}`)
  lines.push(``, `We will share your driver details once assigned. Thank you!`, ``, `JMS Travels Team`)
  return lines.join('\n')
}

async function logOutbound(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    bookingId: string
    clientId: string | null | undefined
    channel: string
    recipient: string | null | undefined
    body: string
    templateKey: string
    status: string
  }
) {
  await supabase.from('message_logs').insert({
    booking_id: params.bookingId,
    client_id: params.clientId,
    channel: params.channel,
    direction: 'outbound',
    recipient: params.recipient,
    content: params.body,
    template_used: params.templateKey,
    status: params.status,
  })
}

export async function POST(request: Request) {
  const { raw_message_id, client: clientFromReq, message, channel, sender_email, sender_name, sender_phone, skip_auto_reply } = await request.json()
  let client = clientFromReq
  const supabase = createAdminClient()

  try {
    const classification = await classifyMessage(message)

    await supabase
      .from('raw_messages')
      .update({ ai_classification: classification.classification, ai_confidence: classification.confidence, processed: true })
      .eq('id', raw_message_id)

    if (classification.classification === 'junk') {
      return NextResponse.json({ ok: true, classification: 'junk' })
    }

    if (classification.classification === 'enquiry' || classification.classification === 'unclassified') {
      const replyTo = channel === 'whatsapp' ? (sender_phone || (client as Client)?.primary_phone) : null
      if (channel === 'whatsapp' && replyTo) {
        const reply = classification.classification === 'enquiry'
          ? 'For rates and pricing information, please call us at 9845572207. We are happy to help!'
          : 'For any queries or assistance, please call us at 9845572207.'
        await sendWhatsAppMessage({ to: replyTo, body: reply })
      }
      return NextResponse.json({ ok: true, classification: classification.classification })
    }

    // Booking flow
    const savedLocations: ClientLocation[] = (client as Client & { locations?: ClientLocation[] })?.locations || []
    const extraction = await extractBookingFields(message, client, savedLocations)

    // Check for past date
    const today = getTodayIST()
    const isPastDate = extraction.extracted.pickup_date && extraction.extracted.pickup_date < today

    if (isPastDate) {
      extraction.extracted.pickup_date = null
      if (!extraction.missing_mandatory.includes('pickup_date')) {
        extraction.missing_mandatory.push('pickup_date')
      }
    }

    await supabase
      .from('raw_messages')
      .update({ ai_extracted_fields: extraction.extracted, ai_missing_fields: extraction.missing_mandatory })
      .eq('id', raw_message_id)

    // Auto-create client from email if not found in database
    if (!client && channel === 'email' && sender_email) {
      const name = sender_name || sender_email.split('@')[0]
      const { data: newClient } = await supabase
        .from('clients')
        .insert({ name, primary_email: sender_email, client_type: 'corporate' })
        .select('*, company:companies!company_id(*), locations:client_locations(*)')
        .single()
      if (newClient) {
        client = newClient
        console.log('[parse-message] auto-created client:', newClient.id, name)
      }
    }

    const flags: string[] = []
    if (!extraction.extracted.pickup_location) flags.push('missing_pickup')
    if (!extraction.extracted.pickup_date) flags.push('missing_date')
    if (!extraction.extracted.pickup_time) flags.push('missing_time')
    if (!(client as Client)?.company_id) flags.push('unknown_company')
    if (!extraction.extracted.drop_location) flags.push('missing_drop')
    if (extraction.is_guest_booking && !(client as Client)?.id) flags.push('guest_booking')

    const bookingRef = generateBookingRef()
    const { data: booking } = await supabase
      .from('bookings')
      .insert({
        booking_ref: bookingRef,
        client_id: (client as Client)?.id || null,
        company_id: (client as Client)?.company_id || null,
        status: 'draft',
        source: channel,
        flags,
        pickup_location: extraction.extracted.pickup_location,
        drop_location: extraction.extracted.drop_location,
        pickup_date: extraction.extracted.pickup_date,
        pickup_time: extraction.extracted.pickup_time,
        pax_count: extraction.extracted.pax_count,
        vehicle_type: extraction.extracted.vehicle_type,
        guest_name: extraction.extracted.guest_name,
        guest_phone: extraction.extracted.guest_phone,
        trip_type: extraction.extracted.trip_type,
        service_type: extraction.extracted.service_type,
        total_days: extraction.extracted.total_days,
        special_instructions: extraction.extracted.special_instructions,
      })
      .select()
      .single()

    if (booking) {
      await supabase.from('raw_messages').update({ booking_id: booking.id }).eq('id', raw_message_id)

      if (extraction.new_keyword_detected && booking.client_id) {
        const keyword = extraction.new_keyword_detected
        const resolvedAddress = extraction.resolved_keywords?.[keyword]
        if (resolvedAddress) {
          try {
            await supabase.from('client_locations')
              .upsert({ client_id: booking.client_id, keyword, address: resolvedAddress }, { onConflict: 'client_id,keyword' })
          } catch { /* non-critical */ }
        }
      }

      await supabase.from('booking_status_history').insert({
        booking_id: booking.id,
        new_status: 'draft',
        changed_by: 'system',
      })

      // If mandatory fields missing, send one auto-reply (unless suppressed for onboarding)
      if (extraction.missing_mandatory.length > 0) {
        if (!skip_auto_reply) {
          // Use specific past-date message if that's the only issue
          const pastDateOnly = isPastDate && extraction.missing_mandatory.length === 1 && extraction.missing_mandatory[0] === 'pickup_date'
          const templateKey = TEMPLATE_KEYS.MISSING_INFO_REQUEST
          const { data: tmpl } = await supabase
            .from('message_templates')
            .select('body, subject')
            .eq('template_key', templateKey)
            .single()

          const clientName = (client as Client)?.name || 'there'
          const missingList = pastDateOnly
            ? 'pickup date (the date provided appears to be in the past — please provide a future date)'
            : extraction.missing_mandatory.map(f => f.replace(/_/g, ' ')).join(', ')
          const recipient = channel === 'whatsapp' ? ((client as Client)?.primary_phone || sender_phone) : sender_email

          if (tmpl) {
            const body = fillTemplate(tmpl.body, { client_name: clientName, missing_fields_list: missingList, booking_ref: bookingRef })
            let status = 'failed'
            if (channel === 'whatsapp' && recipient) {
              const result = await sendWhatsAppMessage({ to: recipient, body })
              status = result.ok ? 'sent' : `failed: ${result.error}`
            } else if (channel === 'email' && recipient) {
              try {
                await sendEmail({ to: recipient, subject: fillTemplate(tmpl.subject || '', { booking_ref: bookingRef }), body })
                status = 'sent'
              } catch (e) { status = `failed: ${String(e)}` }
            }
            await logOutbound(supabase, { bookingId: booking.id, clientId: (client as Client)?.id, channel, recipient, body, templateKey, status })
          }
        }
        return NextResponse.json({ ok: true, booking_id: booking.id, missing: extraction.missing_mandatory })
      }

      // Check if approval required
      if ((client as Client)?.company_id) {
        const { data: company } = await supabase
          .from('companies')
          .select('*')
          .eq('id', (client as Client).company_id!)
          .single()

        if (company?.approval_required) {
          await supabase.from('bookings').update({ status: 'pending_approval', approval_status: 'pending' }).eq('id', booking.id)
          await supabase.from('booking_status_history').insert({
            booking_id: booking.id,
            old_status: 'draft',
            new_status: 'pending_approval',
            changed_by: 'system',
          })
          return NextResponse.json({ ok: true, booking_id: booking.id, requires_approval: true })
        }
      }

      if (skip_auto_reply) return NextResponse.json({ ok: true, booking_id: booking.id })

      // Send booking confirmation
      const recipient = channel === 'whatsapp' ? ((client as Client)?.primary_phone || sender_phone) : (sender_email || (client as Client)?.primary_email)
      const clientName = (client as Client)?.name || 'there'

      if (channel === 'whatsapp' && recipient) {
        const body = buildWhatsAppConfirmation(clientName, bookingRef, extraction.extracted)
        const result = await sendWhatsAppMessage({ to: recipient, body })
        await logOutbound(supabase, { bookingId: booking.id, clientId: (client as Client)?.id, channel, recipient, body, templateKey: TEMPLATE_KEYS.BOOKING_RECEIVED, status: result.ok ? 'sent' : `failed: ${result.error}` })
      } else if (channel === 'email' && recipient) {
        const { data: tmpl } = await supabase.from('message_templates').select('body, subject').eq('template_key', TEMPLATE_KEYS.BOOKING_RECEIVED).single()
        if (tmpl) {
          const body = fillTemplate(tmpl.body, { client_name: clientName, booking_ref: bookingRef })
          let status = 'failed'
          try {
            await sendEmail({ to: recipient, subject: fillTemplate(tmpl.subject || '', { booking_ref: bookingRef }), body })
            status = 'sent'
          } catch (e) { status = `failed: ${String(e)}` }
          await logOutbound(supabase, { bookingId: booking.id, clientId: (client as Client)?.id, channel, recipient, body, templateKey: TEMPLATE_KEYS.BOOKING_RECEIVED, status })
        }
      }
    }

    return NextResponse.json({ ok: true, booking_id: booking?.id })
  } catch (err) {
    console.error('[parse-message] Error:', String(err))
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
