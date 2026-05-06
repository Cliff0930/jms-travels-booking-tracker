import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit  = 100
  const from      = searchParams.get('from')
  const to        = searchParams.get('to')
  const q         = searchParams.get('q')?.trim()
  const client_id = searchParams.get('client_id')

  const supabase = createAdminClient()

  // ── Client conversation mode (ascending — oldest first for chat view) ──
  if (client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('primary_phone, primary_email')
      .eq('id', client_id)
      .single()

    let outQ = supabase
      .from('message_logs')
      .select('id, booking_id, client_id, client:clients!client_id(name), channel, direction, sender, recipient, content, template_used, status, sent_at')
      .eq('client_id', client_id)
      .order('sent_at', { ascending: true })
      .limit(limit)

    let inQ = supabase
      .from('raw_messages')
      .select('id, channel, sender_phone, sender_name, raw_content, ai_classification, booking_id, received_at')
      .order('received_at', { ascending: true })
      .limit(limit)

    if (client?.primary_phone) {
      inQ = inQ.eq('sender_phone', client.primary_phone)
    } else {
      inQ = inQ.eq('sender_phone', '__no_match__')
    }

    if (from) { outQ = outQ.gte('sent_at', `${from}T00:00:00`); inQ = inQ.gte('received_at', `${from}T00:00:00`) }
    if (to)   { outQ = outQ.lte('sent_at', `${to}T23:59:59`);   inQ = inQ.lte('received_at', `${to}T23:59:59`) }

    const [{ data: outbound }, { data: inbound }] = await Promise.all([outQ, inQ])

    const combined = [
      ...(outbound || []).map(m => ({
        id: `out_${m.id}`,
        type: 'outbound' as const,
        channel: m.channel,
        contact: m.recipient,
        client_name: (m.client as unknown as { name: string } | null)?.name ?? null,
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
        client_name: m.sender_name ?? null,
        content: m.raw_content,
        template: null,
        status: m.ai_classification || 'received',
        booking_id: m.booking_id,
        timestamp: m.received_at,
      })),
    ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    return NextResponse.json(combined)
  }

  // ── Default flat list mode (descending — newest first) ──────────────────
  let outQ = supabase
    .from('message_logs')
    .select('id, booking_id, client_id, client:clients!client_id(name), channel, direction, sender, recipient, content, template_used, status, sent_at')
    .order('sent_at', { ascending: false })
    .limit(limit)

  let inQ = supabase
    .from('raw_messages')
    .select('id, channel, sender_phone, sender_name, raw_content, ai_classification, booking_id, received_at')
    .order('received_at', { ascending: false })
    .limit(limit)

  if (from) { outQ = outQ.gte('sent_at', `${from}T00:00:00`); inQ = inQ.gte('received_at', `${from}T00:00:00`) }
  if (to)   { outQ = outQ.lte('sent_at', `${to}T23:59:59`);   inQ = inQ.lte('received_at', `${to}T23:59:59`) }
  if (q)    { outQ = outQ.ilike('recipient', `%${q}%`);        inQ = inQ.or(`sender_phone.ilike.%${q}%,sender_name.ilike.%${q}%`) }

  const [{ data: outbound }, { data: inbound }] = await Promise.all([outQ, inQ])

  const combined = [
    ...(outbound || []).map(m => ({
      id: `out_${m.id}`,
      type: 'outbound' as const,
      channel: m.channel,
      contact: m.recipient,
      client_name: (m.client as unknown as { name: string } | null)?.name ?? null,
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
      client_name: m.sender_name ?? null,
      content: m.raw_content,
      template: null,
      status: m.ai_classification || 'received',
      booking_id: m.booking_id,
      timestamp: m.received_at,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit)

  return NextResponse.json(combined)
}
