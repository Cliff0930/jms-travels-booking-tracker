import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fillTemplate } from '@/lib/templates'
import { sendEmail } from '@/lib/gmail/send'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'

const DUMMY_VARS: Record<string, string> = {
  client_name: 'Test Client',
  booking_ref: 'BK-2026-0001',
  guest_name: 'Test Guest',
  pickup_location: '123 Brigade Road, Bengaluru',
  drop_location: 'Kempegowda International Airport',
  pickup_date: new Date().toISOString().split('T')[0],
  pickup_time: '09:00',
  pax_count: '2',
  driver_name: 'Raju Kumar',
  driver_phone: '+91 98765 43210',
  vehicle_name: 'Toyota Innova',
  vehicle_color: 'White',
  vehicle_number: 'KA 01 AB 1234',
  arrived_link: '#test-arrived-link',
  completed_link: '#test-completed-link',
  approver_name: 'Approver Test',
  missing_fields_list: 'pickup time, drop location',
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { recipient_phone, recipient_email } = await request.json()

  if (!recipient_phone && !recipient_email) {
    return NextResponse.json({ error: 'Provide recipient_phone or recipient_email' }, { status: 400 })
  }

  const { data: tmpl } = await supabase
    .from('message_templates')
    .select('*')
    .eq('id', id)
    .single()

  if (!tmpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const body = fillTemplate(tmpl.body, DUMMY_VARS)
  const subject = fillTemplate(tmpl.subject || 'Test: ' + tmpl.name, DUMMY_VARS)

  if (recipient_phone) {
    await sendWhatsAppMessage({ to: recipient_phone, body })
    return NextResponse.json({ ok: true, channel: 'whatsapp', recipient: recipient_phone })
  }

  await sendEmail({ to: recipient_email, subject, body })
  return NextResponse.json({ ok: true, channel: 'email', recipient: recipient_email })
}
