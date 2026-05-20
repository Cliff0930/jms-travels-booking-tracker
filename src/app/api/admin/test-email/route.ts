import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/gmail/send'

export async function POST(request: Request) {
  const { to } = await request.json().catch(() => ({}))
  const recipient = to || process.env.GMAIL_USER_EMAIL!

  const tokenHint = process.env.GMAIL_REFRESH_TOKEN?.slice(0, 12) || 'missing'

  try {
    const messageId = await sendEmail({
      to: recipient,
      subject: `CabFlow Email Test — ${new Date().toISOString()}`,
      body: `This is a test email sent from CabFlow at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.\n\nIf you received this, Gmail sending is working correctly.`,
      skipSignature: true,
    })
    return NextResponse.json({ ok: true, messageId, to: recipient, tokenHint })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[test-email] failed:', error)
    return NextResponse.json({ ok: false, error, to: recipient, tokenHint }, { status: 500 })
  }
}
