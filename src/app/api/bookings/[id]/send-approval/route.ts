import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fillTemplate, TEMPLATE_KEYS } from '@/lib/templates'
import { sendEmail } from '@/lib/gmail/send'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import type { Company, Client } from '@/types'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, company:companies(*), client:clients(*)')
    .eq('id', id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const company = booking.company as Company | null
  if (!company) return NextResponse.json({ error: 'No company linked to this booking' }, { status: 400 })

  const hasEmailApprovers = company.approver_emails?.length > 0
  const hasWAApprovers = company.approver_whatsapp?.length > 0
  if (!hasEmailApprovers && !hasWAApprovers) {
    return NextResponse.json({ error: 'No approver contacts configured on company' }, { status: 400 })
  }

  const { data: tmpl } = await supabase
    .from('message_templates')
    .select('body, subject')
    .eq('template_key', TEMPLATE_KEYS.APPROVAL_REQUEST)
    .single()

  if (!tmpl) return NextResponse.json({ error: 'Approval request template not found' }, { status: 500 })

  const client = booking.client as Client | null
  const guestName = booking.guest_name || client?.name || 'Guest'
  const vars = {
    approver_name: company.approver_emails?.[0] || 'Approver',
    booking_ref: booking.booking_ref,
    guest_name: guestName,
    pickup_location: booking.pickup_location || 'TBD',
    pickup_date: booking.pickup_date || 'TBD',
    pickup_time: booking.pickup_time || 'TBD',
  }

  const body = fillTemplate(tmpl.body, vars)
  const subject = fillTemplate(tmpl.subject || '', vars)
  const channel = company.approval_channel || 'email'

  const sends: Promise<void>[] = []

  if ((channel === 'email' || channel === 'both') && hasEmailApprovers) {
    for (const email of company.approver_emails) {
      sends.push(sendEmail({ to: email, subject, body }).catch(e => console.error('Email send error:', e)))
    }
    await supabase.from('message_logs').insert({
      booking_id: id,
      channel: 'email',
      direction: 'outbound',
      recipient: company.approver_emails.join(', '),
      content: body,
      template_used: TEMPLATE_KEYS.APPROVAL_REQUEST,
    })
  }

  if ((channel === 'whatsapp' || channel === 'both') && hasWAApprovers) {
    for (const phone of company.approver_whatsapp) {
      sends.push(sendWhatsAppMessage({ to: phone, body }).catch(e => console.error('WA send error:', e)))
    }
    await supabase.from('message_logs').insert({
      booking_id: id,
      channel: 'whatsapp',
      direction: 'outbound',
      recipient: company.approver_whatsapp.join(', '),
      content: body,
      template_used: TEMPLATE_KEYS.APPROVAL_REQUEST,
    })
  }

  await Promise.allSettled(sends)

  await supabase
    .from('bookings')
    .update({ approval_status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
