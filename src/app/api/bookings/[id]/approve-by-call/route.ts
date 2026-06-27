import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { TEMPLATE_KEYS } from '@/lib/templates'
import { sendEmailSafe } from '@/lib/gmail/send'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/send'
import { formatDate } from '@/lib/utils/date'
import type { Company, Client } from '@/types'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { note, actioned_by } = await request.json()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, company:companies!company_id(*), client:clients!client_id(*)')
    .eq('id', id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'draft',
      approval_status: 'approved',
      approval_method: 'verbal',
      approval_note: note,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const operator = actioned_by || 'operator'

  await supabase.from('approval_logs').insert({
    booking_id: id,
    method: 'verbal',
    note,
    actioned_by: operator,
  })

  await supabase.from('booking_status_history').insert({
    booking_id: id,
    old_status: booking.status,
    new_status: 'draft',
    changed_by: operator,
    note: `Verbal approval: ${note}`,
  })

  // Send verbal_approval_ack to company approvers
  const company = booking.company as Company | null
  if (company) {
    const client = booking.client as Client | null
    const guestName = booking.guest_name || client?.name || 'Guest'
    const approverName = company.approver_emails?.[0] || 'Team'
    const pickupDate = formatDate(booking.pickup_date)
    const channel = company.approval_channel || 'email'

    const ackBody = [
      `Hi ${approverName},`,
      ``,
      `This is to confirm that verbal approval has been recorded for booking ${booking.booking_ref} (${guestName}, ${pickupDate}).`,
      ``,
      `The booking has been updated and will now proceed. Thank you.`,
      ``,
      `— JMS Travels`,
    ].join('\n')

    if ((channel === 'email' || channel === 'both') && company.approver_emails?.length) {
      const results = await Promise.all(
        company.approver_emails.map((email: string) =>
          sendEmailSafe({ to: email, subject: `Verbal Approval Confirmed — ${booking.booking_ref}`, body: ackBody, booking_id: id })
        )
      )
      const anyOk = results.some(r => r.ok)
      await supabase.from('message_logs').insert({
        booking_id: id,
        channel: 'email',
        direction: 'outbound',
        recipient: company.approver_emails.join(', '),
        content: ackBody,
        template_used: TEMPLATE_KEYS.VERBAL_APPROVAL_ACK,
        status: anyOk ? 'sent' : 'failed',
      })
    }

    if ((channel === 'whatsapp' || channel === 'both') && company.approver_whatsapp?.length) {
      const results = await Promise.all(
        company.approver_whatsapp.map((phone: string) =>
          sendWhatsAppTemplate({
            to: phone,
            templateName: 'jms_verbal_approval_ack',
            params: [approverName, booking.booking_ref, guestName, pickupDate],
            fallbackBody: ackBody,
            costBookingId: id,
          })
        )
      )
      const anyOk = results.some(r => r.ok)
      await supabase.from('message_logs').insert({
        booking_id: id,
        channel: 'whatsapp',
        direction: 'outbound',
        recipient: company.approver_whatsapp.join(', '),
        content: ackBody,
        template_used: TEMPLATE_KEYS.VERBAL_APPROVAL_ACK,
        status: anyOk ? 'sent' : 'failed',
      })
    }
  }

  return NextResponse.json(data)
}
