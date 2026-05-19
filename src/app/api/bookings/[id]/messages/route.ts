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

  // Inbound raw messages directly linked to this booking
  const { data: directInbound } = await supabase
    .from('raw_messages')
    .select('id, channel, sender_phone, sender_email, sender_name, raw_content, received_at, ai_classification')
    .eq('booking_id', id)
    .order('received_at', { ascending: true })

  // Also look up the conversation session for this booking — WhatsApp messages from
  // the session may not have had booking_id backlinked (e.g. if created via a delayed flow)
  const { data: session } = await supabase
    .from('conversation_sessions')
    .select('phone, created_at')
    .eq('booking_id', id)
    .maybeSingle()

  let sessionInbound: typeof directInbound = []
  if (session?.phone) {
    const { data: extra } = await supabase
      .from('raw_messages')
      .select('id, channel, sender_phone, sender_email, sender_name, raw_content, received_at, ai_classification')
      .eq('sender_phone', session.phone)
      .gte('received_at', session.created_at)
      .order('received_at', { ascending: true })
    sessionInbound = extra ?? []
  }

  // Merge direct + session inbound, deduplicate by id
  const seenIds = new Set<string>()
  const allInbound = [...(directInbound ?? []), ...sessionInbound].filter(m => {
    if (seenIds.has(m.id)) return false
    seenIds.add(m.id)
    return true
  })

  // Also backlink any session messages that are still missing booking_id
  const toBacklink = sessionInbound.filter(
    m => !(directInbound ?? []).some(d => d.id === m.id)
  )
  if (toBacklink.length > 0) {
    await supabase
      .from('raw_messages')
      .update({ booking_id: id })
      .in('id', toBacklink.map(m => m.id))
      .is('booking_id', null)
  }

  const inboundMapped = allInbound.map(m => ({
    id: `raw_${m.id}`,
    booking_id: id,
    client_id: null,
    driver_id: null,
    channel: m.channel,
    direction: 'inbound' as const,
    sender: m.sender_phone || m.sender_email || m.sender_name || null,
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
