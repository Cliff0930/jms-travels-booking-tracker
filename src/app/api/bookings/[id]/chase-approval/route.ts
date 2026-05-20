import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { TEMPLATE_KEYS } from '@/lib/templates'
import { sendEmailSafe } from '@/lib/gmail/send'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/send'
import { approvalLink } from '@/lib/utils/approval-token'
import { createShortLink } from '@/lib/utils/short-link'
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

  const client = booking.client as Client | null
  const guestName = booking.guest_name || client?.name || 'Guest'
  const approverName = company.approver_emails?.[0] || 'Approver'
  const channel = company.approval_channel || 'email'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://booking.jmstravels.net'

  const [approveUrl, rejectUrl] = await Promise.all([
    createShortLink(approvalLink(appUrl, id, 'approve'), id),
    createShortLink(approvalLink(appUrl, id, 'reject'), id),
  ])

  const chaseBody = [
    `Hi ${approverName},`,
    ``,
    `This is a reminder that booking ${booking.booking_ref} for ${guestName} on ${booking.pickup_date || 'TBD'} at ${booking.pickup_time || 'TBD'} is still awaiting your approval.`,
    ``,
    `✅ Approve: ${approveUrl}`,
    `❌ Reject: ${rejectUrl}`,
    ``,
    `— JMS Travels`,
  ].join('\n')

  if ((channel === 'email' || channel === 'both') && hasEmailApprovers) {
    const results = await Promise.all(
      company.approver_emails.map((email: string) =>
        sendEmailSafe({ to: email, subject: `REMINDER: Approval Required — ${booking.booking_ref}`, body: chaseBody })
      )
    )
    const anyOk = results.some(r => r.ok)
    await supabase.from('message_logs').insert({
      booking_id: id,
      channel: 'email',
      direction: 'outbound',
      recipient: company.approver_emails.join(', '),
      content: chaseBody,
      template_used: TEMPLATE_KEYS.APPROVAL_CHASE,
      status: anyOk ? 'sent' : 'failed',
    })
  }

  if ((channel === 'whatsapp' || channel === 'both') && hasWAApprovers) {
    const results = await Promise.all(
      company.approver_whatsapp.map((phone: string) =>
        sendWhatsAppTemplate({
          to: phone,
          templateName: 'jms_approval_chase',
          params: [approverName, booking.booking_ref, booking.pickup_date || 'TBD', booking.pickup_time || 'TBD'],
          fallbackBody: chaseBody,
        })
      )
    )
    const anyOk = results.some(r => r.ok)
    await supabase.from('message_logs').insert({
      booking_id: id,
      channel: 'whatsapp',
      direction: 'outbound',
      recipient: company.approver_whatsapp.join(', '),
      content: chaseBody,
      template_used: TEMPLATE_KEYS.APPROVAL_CHASE,
      status: anyOk ? 'sent' : 'failed',
    })
  }

  return NextResponse.json({ ok: true })
}
