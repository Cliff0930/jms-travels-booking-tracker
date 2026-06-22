import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/gmail/send'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const admin = createAdminClient()
  const { data } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  return data?.role === 'admin'
}

export async function POST(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { to } = await request.json().catch(() => ({}))
  const recipient = to || process.env.GMAIL_USER_EMAIL!

  try {
    const messageId = await sendEmail({
      to: recipient,
      subject: `JMS Travel — Email Signature Test`,
      body: `Hi,\n\nThis is a test email from JMS Travels booking system.\n\nIf you can see the signature below with the logo and contact details, everything is set up correctly.`,
    })
    return NextResponse.json({ ok: true, messageId, to: recipient })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[test-email] failed:', error)
    return NextResponse.json({ ok: false, error, to: recipient }, { status: 500 })
  }
}
