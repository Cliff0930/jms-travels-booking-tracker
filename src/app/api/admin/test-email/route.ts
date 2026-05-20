import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/gmail/send'

export async function POST(request: Request) {
  const { to } = await request.json().catch(() => ({}))
  const recipient = to || process.env.GMAIL_USER_EMAIL!

  const tokenHint = process.env.GMAIL_REFRESH_TOKEN?.slice(0, 12) || 'missing'

  // Direct token refresh test — bypasses googleapis library
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })
  const tokenData = await tokenRes.json() as Record<string, unknown>
  if (!tokenRes.ok) {
    return NextResponse.json({ ok: false, stage: 'token_refresh', tokenData, tokenHint }, { status: 500 })
  }

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detail = (e as any)?.response?.data || (e as any)?.errors || null
    console.error('[test-email] failed:', error, detail)
    return NextResponse.json({ ok: false, error, detail, to: recipient, tokenHint }, { status: 500 })
  }
}
