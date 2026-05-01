import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'

export const maxDuration = 30

export async function POST(request: Request) {
  const { session_id, booking_id, phone, client_name } = await request.json()

  // Wait 15 seconds — giving the client time to add special notes
  await new Promise<void>(resolve => setTimeout(resolve, 15000))

  const supabase = createAdminClient()

  const { data: session } = await supabase
    .from('conversation_sessions')
    .select('*')
    .eq('id', session_id)
    .single()

  if (!session || session.status !== 'awaiting_ack') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('booking_ref, special_instructions')
    .eq('id', booking_id)
    .single()

  // Append any messages sent during the 15s window to special_instructions
  const completedAt = session.completed_at as string | null
  if (completedAt) {
    type SessionMsg = { role: string; content: string; timestamp: string }
    const lateMsgs = (session.messages as SessionMsg[])
      .filter(m => m.role === 'client' && m.timestamp > completedAt)

    if (lateMsgs.length > 0) {
      const extra = lateMsgs.map(m => m.content).join(' ')
      const current = booking?.special_instructions || ''
      const updated = current ? `${current}. ${extra}` : extra
      await supabase
        .from('bookings')
        .update({ special_instructions: updated, updated_at: new Date().toISOString() })
        .eq('id', booking_id)
    }
  }

  const bookingRef = booking?.booking_ref ?? 'N/A'
  const name = client_name || 'there'
  const ackBody = [
    `Hi ${name}, we have received your booking request.`,
    ``,
    `Ref: ${bookingRef}`,
    ``,
    `Our team will review and confirm your booking shortly. Thank you for choosing JMS Travels!`,
  ].join('\n')

  await sendWhatsAppMessage({ to: phone, body: ackBody })

  await supabase
    .from('conversation_sessions')
    .update({ status: 'complete' })
    .eq('id', session_id)

  return NextResponse.json({ ok: true })
}
