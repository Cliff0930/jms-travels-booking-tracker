import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fillTemplate, TEMPLATE_KEYS } from '@/lib/templates'
import { sendEmail } from '@/lib/gmail/send'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import type { Company, Client } from '@/types'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { note, actioned_by } = await request.json()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, company:companies(*), client:clients!client_id(*)')
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
    const { data: tmpl } = await supabase
      .from('message_templates')
      .select('body, subject')
      .eq('template_key', TEMPLATE_KEYS.VERBAL_APPROVAL_ACK)
      .single()

    if (tmpl) {
      const client = booking.client as Client | null
      const guestName = booking.guest_name || client?.name || 'Guest'
      const vars = {
        approver_name: company.approver_emails?.[0] || 'Team',
        booking_ref: booking.booking_ref,
        guest_name: guestName,
        pickup_date: booking.pickup_date || 'TBD',
      }
      const body = fillTemplate(tmpl.body, vars)
      const subject = fillTemplate(tmpl.subject || '', vars)
      const channel = company.approval_channel || 'email'

      if ((channel === 'email' || channel === 'both') && company.approver_emails?.length) {
        for (const email of company.approver_emails) {
          await sendEmail({ to: email, subject, body }).catch(e => console.error('Verbal ack email error:', e))
        }
        await supabase.from('message_logs').insert({
          booking_id: id,
          channel: 'email',
          direction: 'outbound',
          recipient: company.approver_emails.join(', '),
          content: body,
          template_used: TEMPLATE_KEYS.VERBAL_APPROVAL_ACK,
        })
      }

      if ((channel === 'whatsapp' || channel === 'both') && company.approver_whatsapp?.length) {
        for (const phone of company.approver_whatsapp) {
          await sendWhatsAppMessage({ to: phone, body }).catch(e => console.error('Verbal ack WA error:', e))
        }
        await supabase.from('message_logs').insert({
          booking_id: id,
          channel: 'whatsapp',
          direction: 'outbound',
          recipient: company.approver_whatsapp.join(', '),
          content: body,
          template_used: TEMPLATE_KEYS.VERBAL_APPROVAL_ACK,
        })
      }
    }
  }

  return NextResponse.json(data)
}
