import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fillTemplate, TEMPLATE_KEYS } from '@/lib/templates'
import { sendEmail } from '@/lib/gmail/send'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import { approvalLink } from '@/lib/utils/approval-token'
import type { Company, Client } from '@/types'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, company:companies(*), client:clients!client_id(*)')
    .eq('id', id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (booking.status !== 'pending_approval') return NextResponse.json({ error: 'Booking is not pending approval' }, { status: 400 })

  const company = booking.company as Company | null
  if (!company) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

  const hasEmailApprovers = company.approver_emails?.length > 0
  const hasWAApprovers = company.approver_whatsapp?.length > 0
  if (!hasEmailApprovers && !hasWAApprovers) {
    return NextResponse.json({ error: 'No approver contacts configured' }, { status: 400 })
  }

  const { data: tmpl } = await supabase
    .from('message_templates')
    .select('body, subject')
    .eq('template_key', TEMPLATE_KEYS.APPROVAL_CHASE)
    .single()

  if (!tmpl) return NextResponse.json({ error: 'Chase template not found' }, { status: 500 })

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

  const baseBody = fillTemplate(tmpl.body, vars)
  const subject = fillTemplate(tmpl.subject || '', vars)
  const channel = company.approval_channel || 'email'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://booking.jmstravels.net'

  const approveUrl = approvalLink(appUrl, id, 'approve')
  const rejectUrl = approvalLink(appUrl, id, 'reject')
  const emailBody = `${baseBody}\n\nQuick links:\n✅ Approve: ${approveUrl}\n❌ Reject: ${rejectUrl}`

  const sends: Promise<unknown>[] = []

  if ((channel === 'email' || channel === 'both') && hasEmailApprovers) {
    for (const email of company.approver_emails) {
      sends.push(sendEmail({ to: email, subject, body: emailBody }).catch(e => console.error('Chase email error:', e)))
    }
    await supabase.from('message_logs').insert({
      booking_id: id,
      channel: 'email',
      direction: 'outbound',
      recipient: company.approver_emails.join(', '),
      content: emailBody,
      template_used: TEMPLATE_KEYS.APPROVAL_CHASE,
    })
  }

  if ((channel === 'whatsapp' || channel === 'both') && hasWAApprovers) {
    for (const phone of company.approver_whatsapp) {
      sends.push(sendWhatsAppMessage({ to: phone, body: baseBody }).catch(e => console.error('Chase WA error:', e)))
    }
    await supabase.from('message_logs').insert({
      booking_id: id,
      channel: 'whatsapp',
      direction: 'outbound',
      recipient: company.approver_whatsapp.join(', '),
      content: baseBody,
      template_used: TEMPLATE_KEYS.APPROVAL_CHASE,
    })
  }

  await Promise.allSettled(sends)

  return NextResponse.json({ ok: true })
}
