import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') || 'whatsapp' // 'whatsapp' | 'email' | 'driver'
  const supabase = createAdminClient()

  // --- Driver tab ---
  if (tab === 'driver') {
    const { data: logs } = await supabase
      .from('message_logs')
      .select('id, driver_id, recipient, content, sent_at, driver:drivers!driver_id(id, name, phone, vehicle_name)')
      .not('driver_id', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(500)

    const seen = new Set<string>()
    const drivers: {
      id: string; driver_id: string; name: string; phone: string
      vehicle_name: string | null; last_message: string; last_time: string
      needs_attention: boolean
    }[] = []

    for (const log of logs || []) {
      const driverId = log.driver_id as string
      if (seen.has(driverId)) continue
      seen.add(driverId)
      const d = (log.driver as unknown) as { id: string; name: string; phone: string; vehicle_name: string | null } | null
      drivers.push({
        id: driverId,
        driver_id: driverId,
        name: d?.name || 'Unknown Driver',
        phone: d?.phone || log.recipient || '',
        vehicle_name: d?.vehicle_name || null,
        last_message: log.content,
        last_time: log.sent_at,
        needs_attention: false,
      })
    }

    return NextResponse.json(drivers)
  }

  // --- WhatsApp or Email tab ---
  const channel = tab === 'email' ? 'email' : 'whatsapp'

  const [{ data: inbound }, { data: outbound }] = await Promise.all([
    supabase
      .from('raw_messages')
      .select('id, sender_phone, sender_email, sender_name, raw_content, received_at, booking_id')
      .eq('channel', channel)
      .order('received_at', { ascending: false })
      .limit(500),
    supabase
      .from('message_logs')
      .select('id, recipient, content, sent_at, client_id')
      .eq('channel', channel)
      .is('driver_id', null)
      .order('sent_at', { ascending: false })
      .limit(500),
  ])

  // Last outbound per recipient
  const lastOutboundAt: Record<string, string> = {}
  for (const m of outbound || []) {
    if (m.recipient && !lastOutboundAt[m.recipient]) lastOutboundAt[m.recipient] = m.sent_at
  }

  // Build contact map keyed by phone/email
  const contactMap: Record<string, {
    phone: string; name: string | null; last_message: string
    last_time: string; last_is_inbound: boolean
  }> = {}

  for (const m of inbound || []) {
    const identifier = m.sender_phone || m.sender_email
    if (!identifier || contactMap[identifier]) continue
    contactMap[identifier] = {
      phone: identifier, name: m.sender_name, last_message: m.raw_content,
      last_time: m.received_at, last_is_inbound: true,
    }
  }

  // Also add outbound-only contacts (never replied to us)
  for (const m of outbound || []) {
    if (!m.recipient || contactMap[m.recipient]) continue
    contactMap[m.recipient] = {
      phone: m.recipient, name: null, last_message: m.content,
      last_time: m.sent_at, last_is_inbound: false,
    }
  }

  // Needs attention: last inbound has no outbound reply after it
  const contacts = Object.values(contactMap).map(c => {
    const lastOut = lastOutboundAt[c.phone]
    const needsAttention = c.last_is_inbound && (!lastOut || new Date(lastOut) < new Date(c.last_time))
    return { ...c, needs_attention: needsAttention }
  })

  // Look up client names — email tab matches on primary_email, WA tab on primary_phone
  const identifiers = contacts.map(c => c.phone).filter(Boolean)
  const isEmailTab = channel === 'email'
  const { data: clients } = identifiers.length > 0
    ? isEmailTab
      ? await supabase.from('clients').select('id, name, primary_email').in('primary_email', identifiers)
      : await supabase.from('clients').select('id, name, primary_phone').in('primary_phone', identifiers)
    : { data: [] }

  const clientByPhone: Record<string, { id: string; name: string }> = {}
  for (const c of clients || []) {
    const key = isEmailTab ? (c as { id: string; name: string; primary_email: string | null }).primary_email : (c as { id: string; name: string; primary_phone: string | null }).primary_phone
    if (key) clientByPhone[key] = { id: c.id, name: c.name }
  }

  const result = contacts.map(c => ({
    id: c.phone,
    phone: c.phone,
    name: clientByPhone[c.phone]?.name || c.name,
    client_id: clientByPhone[c.phone]?.id || null,
    last_message: c.last_message,
    last_time: c.last_time,
    needs_attention: c.needs_attention,
  })).sort((a, b) => new Date(b.last_time).getTime() - new Date(a.last_time).getTime())

  return NextResponse.json(result)
}
