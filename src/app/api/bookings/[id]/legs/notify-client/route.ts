import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendWhatsAppSmart } from '@/lib/whatsapp/send'
import { sendEmailSafe } from '@/lib/gmail/send'
import { formatDate } from '@/lib/utils/date'
import { formalName, formalGuestName } from '@/lib/utils/client-name'
import { TEMPLATE_KEYS } from '@/lib/templates'
import type { Client } from '@/types'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [bookingRes, legsRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('*, client:clients!client_id(name, primary_phone, primary_email, salutation), guest_client:clients!guest_client_id(name, prefix, designation), company:companies(name, formal_address, show_designation)')
      .eq('id', id)
      .single(),
    supabase
      .from('booking_legs')
      .select('day_number, leg_date, driver_id, driver:drivers!driver_id(name, phone)')
      .eq('booking_id', id)
      .order('day_number', { ascending: true }),
  ])

  const booking = bookingRes.data
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const legs = legsRes.data ?? []
  const assignedLegs = legs.filter(l => l.driver_id)
  if (assignedLegs.length === 0) {
    return NextResponse.json({ error: 'No drivers assigned to any leg yet' }, { status: 400 })
  }

  const client = booking.client as Client | null
  const guestClientRecord = booking.guest_client as { name?: string; prefix?: string; designation?: string } | null
  const company = booking.company as { formal_address?: boolean; show_designation?: boolean } | null
  const clientName = booking.guest_name
    ? formalGuestName(booking.guest_name, guestClientRecord?.prefix ?? null, guestClientRecord?.designation ?? null, company?.show_designation ?? null)
    : formalName(client?.name || 'there', client?.salutation, company?.formal_address)

  const allAssigned = assignedLegs.length === legs.length
  const header = allAssigned
    ? `Hi ${clientName}, driver details for your booking ${booking.booking_ref}:`
    : `Hi ${clientName}, driver details confirmed so far for your booking ${booking.booking_ref}:`

  const dayLines = assignedLegs.map(leg => {
    const driver = leg.driver as { name?: string; phone?: string } | null
    return `Day ${leg.day_number} (${formatDate(leg.leg_date)}) — ${driver?.name || 'TBD'} · ${driver?.phone || 'TBD'}`
  })

  const lines = [
    header,
    '',
    ...dayLines,
    ...(!allAssigned ? ['', 'Drivers for remaining days will be confirmed shortly.'] : []),
    '',
    'JMS Travels — 9845572207',
  ]
  const body = lines.join('\n')

  const guestPhone = booking.guest_phone || null
  const adminPhone = client?.primary_phone || null
  const phones = [...new Set([guestPhone, adminPhone].filter(Boolean))] as string[]

  let status = 'failed'

  if (phones.length > 0) {
    const results = await Promise.all(
      phones.map(phone => sendWhatsAppSmart({
        to: phone,
        templateName: 'leg_client_notify',
        params: [],
        fallbackBody: body,
        costBookingId: id,
      }))
    )
    status = results.some(r => r.ok) ? 'sent' : 'failed'
    await supabase.from('message_logs').insert({
      booking_id: id,
      client_id: booking.client_id,
      channel: 'whatsapp',
      direction: 'outbound',
      recipient: phones.join(', '),
      content: body,
      template_used: TEMPLATE_KEYS.LEG_CLIENT_NOTIFY,
      status,
    })
  } else if (client?.primary_email) {
    const result = await sendEmailSafe({
      to: client.primary_email,
      subject: `Driver Update — ${booking.booking_ref}`,
      body,
      booking_id: id,
    })
    status = result.ok ? 'sent' : 'failed'
    await supabase.from('message_logs').insert({
      booking_id: id,
      client_id: booking.client_id,
      channel: 'email',
      direction: 'outbound',
      recipient: client.primary_email,
      content: body,
      template_used: TEMPLATE_KEYS.LEG_CLIENT_NOTIFY,
      status,
    })
  }

  return NextResponse.json({ ok: status === 'sent' })
}
