import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { classifyMessage } from '@/lib/gemini/classify'
import { extractBookingFields } from '@/lib/gemini/extract'
import { generateBookingRef } from '@/lib/utils/booking-ref'
import { fillTemplate, TEMPLATE_KEYS } from '@/lib/templates'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import { sendEmail } from '@/lib/gmail/send'
import type { Client, ClientLocation } from '@/types'

export async function POST(request: Request) {
  const { raw_message_id, client, message, channel, sender_email } = await request.json()
  const supabase = await createAdminClient()

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
      return NextResponse.json({ ok: true, classification: classification.classification })
    }

    // Booking flow
    const savedLocations: ClientLocation[] = (client as Client & { locations?: ClientLocation[] })?.locations || []
    const extraction = await extractBookingFields(message, client, savedLocations)

    await supabase
      .from('raw_messages')
      .update({ ai_extracted_fields: extraction.extracted, ai_missing_fields: extraction.missing_mandatory })
      .eq('id', raw_message_id)

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

      // Save newly detected location keyword for future resolution
      if (extraction.new_keyword_detected && booking.client_id) {
        const keyword = extraction.new_keyword_detected
        const resolvedAddress = extraction.resolved_keywords?.[keyword]
        if (resolvedAddress) {
          try {
            await supabase.from('client_locations')
              .upsert({ client_id: booking.client_id, keyword, address: resolvedAddress }, { onConflict: 'client_id,keyword' })
          } catch {
            // non-critical
          }
        }
      }

      await supabase.from('booking_status_history').insert({
        booking_id: booking.id,
        new_status: 'draft',
        changed_by: 'system',
      })

      // If mandatory fields missing, send one auto-reply
      if (extraction.missing_mandatory.length > 0) {
        const { data: tmpl } = await supabase
          .from('message_templates')
          .select('body, subject')
          .eq('template_key', TEMPLATE_KEYS.MISSING_INFO_REQUEST)
          .single()

        if (tmpl) {
          const clientName = (client as Client)?.name || 'there'
          const missingList = extraction.missing_mandatory
            .map(f => f.replace(/_/g, ' '))
            .join(', ')
          const body = fillTemplate(tmpl.body, { client_name: clientName, missing_fields_list: missingList, booking_ref: bookingRef })

          if (channel === 'whatsapp' && (client as Client)?.primary_phone) {
            await sendWhatsAppMessage({ to: (client as Client).primary_phone!, body })
          } else if (channel === 'email' && (sender_email || (client as Client)?.primary_email)) {
            await sendEmail({ to: sender_email || (client as Client)?.primary_email!, subject: fillTemplate(tmpl.subject || '', { booking_ref: bookingRef }), body })
          }

          await supabase.from('message_logs').insert({
            booking_id: booking.id,
            client_id: (client as Client)?.id,
            channel,
            direction: 'outbound',
            recipient: channel === 'whatsapp' ? (client as Client)?.primary_phone : sender_email,
            content: body,
            template_used: TEMPLATE_KEYS.MISSING_INFO_REQUEST,
          })
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

      // Send booking received confirmation
      const { data: tmpl } = await supabase
        .from('message_templates')
        .select('body, subject')
        .eq('template_key', TEMPLATE_KEYS.BOOKING_RECEIVED)
        .single()

      if (tmpl) {
        const body = fillTemplate(tmpl.body, { client_name: (client as Client)?.name || 'there', booking_ref: bookingRef })
        if (channel === 'whatsapp' && (client as Client)?.primary_phone) {
          await sendWhatsAppMessage({ to: (client as Client).primary_phone!, body })
        } else if (channel === 'email' && (sender_email || (client as Client)?.primary_email)) {
          await sendEmail({ to: sender_email || (client as Client)?.primary_email!, subject: fillTemplate(tmpl.subject || '', { booking_ref: bookingRef }), body })
        }
        await supabase.from('message_logs').insert({
          booking_id: booking.id,
          client_id: (client as Client)?.id,
          channel,
          direction: 'outbound',
          recipient: channel === 'whatsapp' ? (client as Client)?.primary_phone : sender_email,
          content: body,
          template_used: TEMPLATE_KEYS.BOOKING_RECEIVED,
        })
      }
    }

    return NextResponse.json({ ok: true, booking_id: booking?.id })
  } catch (err) {
    console.error('Parse message error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
