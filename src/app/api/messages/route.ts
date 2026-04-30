import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 50
  const offset = (page - 1) * limit
  const supabase = createAdminClient()

  // Outbound: message_logs
  const { data: outbound } = await supabase
    .from('message_logs')
    .select('id, booking_id, client_id, channel, direction, sender, recipient, content, template_used, status, sent_at')
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Inbound: raw_messages
  const { data: inbound } = await supabase
    .from('raw_messages')
    .select('id, channel, sender_phone, sender_name, raw_content, ai_classification, booking_id, received_at')
    .order('received_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const combined = [
    ...(outbound || []).map(m => ({
      id: `out_${m.id}`,
      type: 'outbound' as const,
      channel: m.channel,
      contact: m.recipient,
      content: m.content,
      template: m.template_used,
      status: m.status,
      booking_id: m.booking_id,
      timestamp: m.sent_at,
    })),
    ...(inbound || []).map(m => ({
      id: `in_${m.id}`,
      type: 'inbound' as const,
      channel: m.channel,
      contact: m.sender_phone,
      content: m.raw_content,
      template: null,
      status: m.ai_classification || 'received',
      booking_id: m.booking_id,
      timestamp: m.received_at,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit)

  return NextResponse.json(combined)
}
