import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fillTemplate, TEMPLATE_KEYS } from '@/lib/templates'
import { sendEmailSafe } from '@/lib/gmail/send'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/send'
import { expireBookingLinks } from '@/lib/utils/short-link'
import type { Client } from '@/types'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { reason } = await request.json()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(name, primary_phone, primary_email), driver:drivers(name, phone)')
    .eq('id', id)
    .single()
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_reason: reason,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('booking_status_history').insert({
    booking_id: id,
    old_status: booking.status,
    new_status: 'cancelled',
    changed_by: 'operator',
    note: reason,
  })

  if (booking.driver_id) {
    await supabase.from('drivers').update({ status: 'available' }).eq('id', booking.driver_id)
  }

  await expireBookingLinks(id).catch(() => {})

  const vars = {
    booking_ref: booking.booking_ref,
    pickup_date: booking.pickup_date || 'TBD',
    pickup_time: booking.pickup_time || 'TBD',
  }

  // Notify client
  const client = booking.client as Client | null
  const clientName = booking.guest_name || client?.name || 'there'
  const { data: clientTmpl } = await supabase
    .from('message_templates')
    .select('body, subject')
    .eq('template_key', TEMPLATE_KEYS.CANCELLATION_CLIENT)
    .single()

  if (clientTmpl) {
    const body = fillTemplate(clientTmpl.body, { ...vars, client_name: clientName })
    const subject = fillTemplate(clientTmpl.subject || '', vars)
    const bookingCc: string[] = Array.isArray(booking.cc_emails) ? booking.cc_emails : []

    // Template params for jms_booking_cancelled:
    // {{1}}=client_name {{2}}=booking_ref {{3}}=date {{4}}=time
    const cancelTemplateParams = [clientName, booking.booking_ref, vars.pickup_date, vars.pickup_time]

    if (booking.source === 'email' && client?.primary_email) {
      // Email-source bookings: notify via email (same channel they used to book)
      const result = await sendEmailSafe({ to: client.primary_email, subject, body, cc: bookingCc.length > 0 ? bookingCc : undefined })
      if (!result.ok) console.error(`[cancel] Email failed booking=${id} error=${result.error}`)
      await supabase.from('message_logs').insert({
        booking_id: id, client_id: booking.client_id,
        channel: 'email', direction: 'outbound',
        recipient: client.primary_email, content: body,
        template_used: TEMPLATE_KEYS.CANCELLATION_CLIENT,
        status: result.ok ? 'sent' : 'failed',
      })
      // Also WhatsApp the guest via template if they have a separate phone
      if (booking.guest_phone) {
        await sendWhatsAppTemplate({ to: booking.guest_phone, templateName: 'jms_booking_cancelled', params: cancelTemplateParams, fallbackBody: body }).catch(() => {})
      }
    } else {
      // WhatsApp-source bookings: notify via template (bypasses 24h window)
      const guestPhone = booking.guest_phone || null
      const adminPhone = client?.primary_phone || null
      const phones = [...new Set([guestPhone, adminPhone].filter(Boolean))] as string[]

      if (phones.length > 0) {
        const results = await Promise.all(
          phones.map(phone => sendWhatsAppTemplate({ to: phone, templateName: 'jms_booking_cancelled', params: cancelTemplateParams, fallbackBody: body }))
        )
        const anyOk = results.some(r => r.ok)
        if (!anyOk) console.error(`[cancel] WhatsApp template failed all phones booking=${id}`, results)
        await supabase.from('message_logs').insert({
          booking_id: id, client_id: booking.client_id,
          channel: 'whatsapp', direction: 'outbound',
          recipient: phones.join(', '), content: body,
          template_used: TEMPLATE_KEYS.CANCELLATION_CLIENT,
          status: anyOk ? 'sent' : 'failed',
        })
      } else if (client?.primary_email) {
        const result = await sendEmailSafe({ to: client.primary_email, subject, body })
        if (!result.ok) console.error(`[cancel] Fallback email failed booking=${id} error=${result.error}`)
        await supabase.from('message_logs').insert({
          booking_id: id, client_id: booking.client_id,
          channel: 'email', direction: 'outbound',
          recipient: client.primary_email, content: body,
          template_used: TEMPLATE_KEYS.CANCELLATION_CLIENT,
          status: result.ok ? 'sent' : 'failed',
        })
      }
    }
  }

  // Notify driver
  const driver = booking.driver as { name: string; phone: string } | null
  if (driver?.phone) {
    const driverFallback = `Hi ${driver.name}, booking ${booking.booking_ref} for ${vars.pickup_date} at ${vars.pickup_time} has been cancelled. You are now available for new assignments. — JMS Travels`
    const result = await sendWhatsAppTemplate({
      to: driver.phone,
      templateName: 'jms_cancellation_driver',
      params: [driver.name, booking.booking_ref, vars.pickup_date, vars.pickup_time],
      fallbackBody: driverFallback,
    })
    if (!result.ok) console.error(`[cancel] Driver WA failed booking=${id} error=${result.error}`)
    await supabase.from('message_logs').insert({
        booking_id: id,
        driver_id: booking.driver_id,
        channel: 'whatsapp',
        direction: 'outbound',
        recipient: driver.phone,
        content: driverFallback,
        template_used: TEMPLATE_KEYS.CANCELLATION_DRIVER,
        status: result.ok ? 'sent' : 'failed',
        whatsapp_message_id: result.whatsappMessageId ?? null,
      })
  }

  return NextResponse.json(data)
}
