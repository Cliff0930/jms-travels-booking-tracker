import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { classifyMessage } from '@/lib/gemini/classify'
import { extractBookingFields } from '@/lib/gemini/extract'
import type { ExtractedFields } from '@/lib/gemini/extract'
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

function formatDate(date: string): string {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
  })
}

function buildWhatsAppConfirmation(
  clientName: string,
  bookingRef: string,
  extracted: ExtractedFields,
): string {
  const tripLabel: Record<string, string> = { local: 'Local', outstation: 'Outstation', airport: 'Airport' }
  const lines = [`Hi ${clientName}, your booking is confirmed.`, ``, `Ref: ${bookingRef}`]
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

function buildMultiBookingEmailBody(clientName: string, bookings: Array<{ ref: string; extracted: ExtractedFields }>): string {
  const lines = [
    `Hi ${clientName},`,
    ``,
    `We have received your ${bookings.length} booking requests. Here is a summary:`,
    ``,
  ]
  bookings.forEach(({ ref, extracted }, i) => {
    lines.push(`${i + 1}. Ref: ${ref}`)
    if (extracted.pickup_date) lines.push(`   Date    : ${formatDate(extracted.pickup_date)}${extracted.pickup_time ? ` at ${formatTime12h(extracted.pickup_time)}` : ''}`)
    if (extracted.pickup_location) lines.push(`   Pickup  : ${extracted.pickup_location}`)
    if (extracted.drop_location)   lines.push(`   Drop    : ${extracted.drop_location}`)
    if (extracted.guest_name)      lines.push(`   Guest   : ${extracted.guest_name}`)
    if (extracted.special_instructions) lines.push(`   Note    : ${extracted.special_instructions}`)
    lines.push(``)
  })
  lines.push(`We will share driver details once assigned. Thank you for choosing JMS Travels.`)
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
  const { raw_message_id, client: clientFromReq, message, channel, sender_email, sender_name, sender_phone, cc_emails, skip_auto_reply, skip_approval } = await request.json()
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
    const today = getTodayIST()

    // Sanitise past dates in all bookings
    for (const bk of extraction.bookings) {
      if (bk.extracted.pickup_date && bk.extracted.pickup_date < today) {
        bk.extracted.pickup_date = null
        if (!bk.missing_mandatory.includes('pickup_date')) bk.missing_mandatory.push('pickup_date')
      }
    }

    const allMissing = extraction.bookings.flatMap(b => b.missing_mandatory)

    await supabase
      .from('raw_messages')
      .update({ ai_extracted_fields: extraction.bookings[0]?.extracted, ai_missing_fields: allMissing })
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

    // Create one booking per extracted entry
    const createdBookings: Array<{ booking: { id: string; booking_ref: string }; extracted: ExtractedFields }> = []

    for (let i = 0; i < extraction.bookings.length; i++) {
      const bk = extraction.bookings[i]
      const flags: string[] = []
      if (!bk.extracted.pickup_location) flags.push('missing_pickup')
      if (!bk.extracted.pickup_date)     flags.push('missing_date')
      if (!bk.extracted.pickup_time)     flags.push('missing_time')
      if (!(client as Client)?.company_id) flags.push('unknown_company')
      if (!bk.extracted.drop_location)   flags.push('missing_drop')
      if (bk.is_guest_booking && !(client as Client)?.id) flags.push('guest_booking')

      const { data: booking } = await supabase
        .from('bookings')
        .insert({
          client_id: (client as Client)?.id || null,
          company_id: (client as Client)?.company_id || null,
          status: 'draft',
          source: channel,
          requested_by: sender_email || sender_phone || null,
          flags,
          cc_emails: (channel === 'email' && Array.isArray(cc_emails) && cc_emails.length > 0) ? cc_emails : null,
          pickup_location: bk.extracted.pickup_location,
          drop_location: bk.extracted.drop_location,
          pickup_date: bk.extracted.pickup_date,
          pickup_time: bk.extracted.pickup_time,
          pax_count: bk.extracted.pax_count,
          vehicle_type: bk.extracted.vehicle_type,
          guest_name: bk.extracted.guest_name,
          guest_phone: bk.extracted.guest_phone,
          trip_type: bk.extracted.trip_type,
          service_type: bk.extracted.service_type,
          total_days: bk.extracted.total_days,
          special_instructions: bk.extracted.special_instructions,
        })
        .select('id, booking_ref')
        .single()

      if (!booking) continue

      createdBookings.push({ booking, extracted: bk.extracted })

      // Link first booking to the raw message
      if (i === 0) {
        await supabase.from('raw_messages').update({ booking_id: booking.id }).eq('id', raw_message_id)
      }

      // Save new client location keyword (first booking only — per-client)
      if (i === 0 && extraction.new_keyword_detected && booking && (client as Client)?.id) {
        const keyword = extraction.new_keyword_detected
        const resolvedAddress = extraction.resolved_keywords?.[keyword]
        if (resolvedAddress) {
          try {
            await supabase.from('client_locations')
              .upsert({ client_id: (client as Client)!.id, keyword, address: resolvedAddress }, { onConflict: 'client_id,keyword' })
          } catch { /* non-critical */ }
        }
      }

      await supabase.from('booking_status_history').insert({ booking_id: booking.id, new_status: 'draft', changed_by: 'system' })

      // Auto-create guest client profile
      if (bk.extracted.guest_name) {
        try {
          const guestPhone = bk.extracted.guest_phone || null
          let existingGuest = null
          if (guestPhone) {
            const { data } = await supabase.from('clients').select('id').eq('primary_phone', guestPhone).maybeSingle()
            existingGuest = data
          }
          if (!existingGuest) {
            await supabase.from('clients').insert({
              name: bk.extracted.guest_name,
              primary_phone: guestPhone,
              company_id: (client as Client)?.company_id ?? null,
              guest_of_company_id: (client as Client)?.company_id ?? null,
              client_type: 'guest',
              is_verified: false,
              is_vip: false,
            })
          }
        } catch { /* non-critical */ }
      }
    }

    if (createdBookings.length === 0) {
      return NextResponse.json({ ok: true, booking_id: null })
    }

    const firstBookingId = createdBookings[0].booking.id
    const clientName = (client as Client)?.name || 'there'
    const emailCc = Array.isArray(cc_emails) && cc_emails.length > 0 ? cc_emails : undefined

    // If any mandatory fields are missing, send one combined reply
    if (allMissing.length > 0) {
      if (!skip_auto_reply) {
        const templateKey = TEMPLATE_KEYS.MISSING_INFO_REQUEST
        const { data: tmpl } = await supabase.from('message_templates').select('body, subject').eq('template_key', templateKey).single()
        const isPastDateOnly = allMissing.length === 1 && allMissing[0] === 'pickup_date'
        const missingList = isPastDateOnly
          ? 'pickup date (the date provided appears to be in the past — please provide a future date)'
          : allMissing.map(f => f.replace(/_/g, ' ')).join(', ')
        const recipient = channel === 'whatsapp' ? ((client as Client)?.primary_phone || sender_phone) : sender_email

        if (tmpl && recipient) {
          const body = fillTemplate(tmpl.body, { client_name: clientName, missing_fields_list: missingList, booking_ref: createdBookings[0].booking.booking_ref })
          let status = 'failed'
          if (channel === 'whatsapp') {
            const result = await sendWhatsAppMessage({ to: recipient, body })
            status = result.ok ? 'sent' : `failed: ${result.error}`
          } else if (channel === 'email') {
            try {
              await sendEmail({ to: recipient, subject: fillTemplate(tmpl.subject || '', { booking_ref: createdBookings[0].booking.booking_ref }), body, cc: emailCc })
              status = 'sent'
            } catch (e) { status = `failed: ${String(e)}` }
          }
          await logOutbound(supabase, { bookingId: firstBookingId, clientId: (client as Client)?.id, channel, recipient, body, templateKey, status })
        }
      }
      return NextResponse.json({ ok: true, booking_id: firstBookingId, booking_ids: createdBookings.map(b => b.booking.id), missing: allMissing })
    }

    // Check if approval required
    if (!skip_approval && (client as Client)?.company_id) {
      const { data: company } = await supabase.from('companies').select('approval_required').eq('id', (client as Client).company_id!).single()
      if (company?.approval_required) {
        for (const { booking } of createdBookings) {
          await supabase.from('bookings').update({ status: 'pending_approval', approval_status: 'pending' }).eq('id', booking.id)
          await supabase.from('booking_status_history').insert({ booking_id: booking.id, old_status: 'draft', new_status: 'pending_approval', changed_by: 'system' })
        }
        return NextResponse.json({ ok: true, booking_id: firstBookingId, booking_ids: createdBookings.map(b => b.booking.id), requires_approval: true })
      }
    }

    if (skip_auto_reply) return NextResponse.json({ ok: true, booking_id: firstBookingId, booking_ids: createdBookings.map(b => b.booking.id) })

    // Send confirmation
    const recipient = channel === 'whatsapp'
      ? ((client as Client)?.primary_phone || sender_phone)
      : (sender_email || (client as Client)?.primary_email)

    if (channel === 'whatsapp' && recipient) {
      if (createdBookings.length === 1) {
        const body = buildWhatsAppConfirmation(clientName, createdBookings[0].booking.booking_ref, createdBookings[0].extracted)
        const result = await sendWhatsAppMessage({ to: recipient, body })
        await logOutbound(supabase, { bookingId: firstBookingId, clientId: (client as Client)?.id, channel, recipient, body, templateKey: TEMPLATE_KEYS.BOOKING_RECEIVED, status: result.ok ? 'sent' : `failed: ${result.error}` })
      } else {
        const lines = [`Hi ${clientName}, your ${createdBookings.length} bookings are confirmed.`, ``]
        createdBookings.forEach(({ booking, extracted }, i) => {
          lines.push(`${i + 1}. Ref: ${booking.booking_ref} — ${extracted.pickup_date || 'TBD'} ${extracted.pickup_time ? formatTime12h(extracted.pickup_time) : ''}`)
        })
        lines.push(``, `Driver details will follow. Thank you! — JMS Travels`)
        const body = lines.join('\n')
        const result = await sendWhatsAppMessage({ to: recipient, body })
        await logOutbound(supabase, { bookingId: firstBookingId, clientId: (client as Client)?.id, channel, recipient, body, templateKey: TEMPLATE_KEYS.BOOKING_RECEIVED, status: result.ok ? 'sent' : `failed: ${result.error}` })
      }
    } else if (channel === 'email' && recipient) {
      if (createdBookings.length === 1) {
        const { data: tmpl } = await supabase.from('message_templates').select('body, subject').eq('template_key', TEMPLATE_KEYS.BOOKING_RECEIVED).single()
        if (tmpl) {
          const { extracted } = createdBookings[0]
          const templateVars = {
            client_name: clientName, name: clientName,
            booking_ref: createdBookings[0].booking.booking_ref,
            reference_number: createdBookings[0].booking.booking_ref,
            guest_name: extracted.guest_name || clientName,
            traveler_name: extracted.guest_name || clientName,
            pickup_date: extracted.pickup_date || '',
            travel_date: extracted.pickup_date || '',
          }
          const body = fillTemplate(tmpl.body, templateVars)
          let status = 'failed'
          try {
            await sendEmail({ to: recipient, subject: fillTemplate(tmpl.subject || '', { booking_ref: createdBookings[0].booking.booking_ref, reference_number: createdBookings[0].booking.booking_ref }), body, cc: emailCc })
            status = 'sent'
          } catch (e) { status = `failed: ${String(e)}` }
          await logOutbound(supabase, { bookingId: firstBookingId, clientId: (client as Client)?.id, channel, recipient, body, templateKey: TEMPLATE_KEYS.BOOKING_RECEIVED, status })
        }
      } else {
        // Multi-booking email confirmation
        const body = buildMultiBookingEmailBody(clientName, createdBookings.map(cb => ({ ref: cb.booking.booking_ref, extracted: cb.extracted })))
        let status = 'failed'
        try {
          await sendEmail({ to: recipient, subject: `${createdBookings.length} bookings received - JMS Travels`, body, cc: emailCc })
          status = 'sent'
        } catch (e) { status = `failed: ${String(e)}` }
        await logOutbound(supabase, { bookingId: firstBookingId, clientId: (client as Client)?.id, channel, recipient, body, templateKey: TEMPLATE_KEYS.BOOKING_RECEIVED, status })
      }
    }

    return NextResponse.json({ ok: true, booking_id: firstBookingId, booking_ids: createdBookings.map(b => b.booking.id) })
  } catch (err) {
    console.error('[parse-message] Error:', String(err))
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
