import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page  = parseInt(searchParams.get('page') || '1')
  const limit = 100
  const offset = (page - 1) * limit

  const from = searchParams.get('from')   // YYYY-MM-DD
  const to   = searchParams.get('to')     // YYYY-MM-DD
  const q    = searchParams.get('q')?.trim()

  const supabase = createAdminClient()

  // ── Outbound: message_logs ────────────────────────────────
  let outQ = supabase
    .from('message_logs')
    .select('id, booking_id, client_id, client:clients(name), channel, direction, sender, recipient, content, template_used, status, sent_at')
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (from) outQ = outQ.gte('sent_at', `${from}T00:00:00`)
  if (to)   outQ = outQ.lte('sent_at', `${to}T23:59:59`)
  if (q)    outQ = outQ.ilike('recipient', `%${q}%`)

  // ── Inbound: raw_messages ─────────────────────────────────
  let inQ = supabase
    .from('raw_messages')
    .select('id, channel, sender_phone, sender_name, raw_content, ai_classification, booking_id, received_at')
    .order('received_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (from) inQ = inQ.gte('received_at', `${from}T00:00:00`)
  if (to)   inQ = inQ.lte('received_at', `${to}T23:59:59`)
  if (q)    inQ = inQ.or(`sender_phone.ilike.%${q}%,sender_name.ilike.%${q}%`)

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
