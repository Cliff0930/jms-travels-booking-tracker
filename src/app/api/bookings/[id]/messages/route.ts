import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  // Outbound messages logged by the system
  const { data: outbound, error } = await supabase
    .from('message_logs')
    .select('*')
    .eq('booking_id', id)
    .order('sent_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Inbound raw messages that triggered or were linked to this booking
  const { data: inbound } = await supabase
    .from('raw_messages')
    .select('id, channel, sender_phone, sender_name, raw_content, received_at, ai_classification')
    .eq('booking_id', id)
    .order('received_at', { ascending: true })

  // Merge into a unified shape matching MessageLog type
  const inboundMapped = (inbound ?? []).map(m => ({
    id: `raw_${m.id}`,
    booking_id: id,
    client_id: null,
    driver_id: null,
    channel: m.channel,
    direction: 'inbound' as const,
    sender: m.sender_phone || m.sender_name || null,
    recipient: null,
    content: m.raw_content,
    template_used: null,
    status: 'received',
    sent_at: m.received_at,
  }))

  const all = [...inboundMapped, ...(outbound ?? [])]
    .sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime())

  return NextResponse.json(all)
}
