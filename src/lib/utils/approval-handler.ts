import type { SupabaseClient } from '@supabase/supabase-js'

export async function handleApprovalReply(
  supabase: SupabaseClient,
  rawContent: string,
  senderPhone: string | null,
  senderEmail: string | null
): Promise<boolean> {
  const match = rawContent.trim().match(/^(APPROVE|CONFIRM|REJECT)\s+(BK-\d{4}-\d+)\b/i)
  if (!match) return false

  const action = match[1].toUpperCase()
  const bookingRef = match[2].toUpperCase()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, approval_status')
    .eq('booking_ref', bookingRef)
    .single()

  if (!booking || booking.status !== 'pending_approval') return false

  const approved = action === 'APPROVE' || action === 'CONFIRM'
  const approverContact = senderPhone || senderEmail || 'unknown'
  const channel = senderPhone ? 'whatsapp' : 'email'

  if (approved) {
    await supabase.from('bookings').update({
      status: 'draft',
      approval_status: 'approved',
      approved_by: approverContact,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', booking.id)
  } else {
    await supabase.from('bookings').update({
      status: 'cancelled',
      approval_status: 'rejected',
      cancelled_reason: 'Approval rejected by approver',
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', booking.id)
  }

  await supabase.from('approval_logs').insert({
    booking_id: booking.id,
    approver_contact: approverContact,
    method: channel,
    note: approved ? 'Approved via reply message' : 'Rejected via reply message',
    actioned_by: approverContact,
  })

  await supabase.from('booking_status_history').insert({
    booking_id: booking.id,
    old_status: booking.status,
    new_status: approved ? 'draft' : 'cancelled',
    changed_by: approverContact,
    note: approved ? `Approval received from ${approverContact}` : `Rejected by ${approverContact}`,
  })

  return true
}
