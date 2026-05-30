import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/server'
import { logApiCost } from '@/lib/api-costs'

const DEFAULT_SIGNATURE = `Best regards,

JMS Travels
Phone: 9845572207
bookings@jmstravels.net`

async function getSignature(): Promise<string> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'email_signature').single()
    return data?.value || DEFAULT_SIGNATURE
  } catch {
    return DEFAULT_SIGNATURE
  }
}

function getGmailAuth() {
  const keyJson = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!, 'base64').toString()
  const key = JSON.parse(keyJson) as { client_email: string; private_key: string }
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    subject: process.env.GMAIL_USER_EMAIL,
  })
}

function encodeSubject(subject: string): string {
  if (/[^\x00-\x7F]/.test(subject)) {
    return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
  }
  return subject
}

interface EmailMessage {
  to: string
  subject: string
  body: string
  cc?: string[]
  skipSignature?: boolean
  replyToThreadId?: string
  inReplyToMessageId?: string
  booking_id?: string
}

export async function sendEmail({ to, subject, body, cc, skipSignature = false, replyToThreadId, inReplyToMessageId, booking_id }: EmailMessage): Promise<string | null> {
  const auth = getGmailAuth()
  const gmail = google.gmail({ version: 'v1', auth })
  const from = process.env.GMAIL_USER_EMAIL!

  const signature = skipSignature ? '' : await getSignature()
  const fullBody = skipSignature ? body : `${body}\n\n${signature}`

  const safeCc = cc?.filter(e => !e.toLowerCase().includes(from.toLowerCase()))
  const ccLine = safeCc?.length ? `Cc: ${safeCc.join(', ')}\r\n` : ''
  const threadingLines = inReplyToMessageId
    ? `In-Reply-To: ${inReplyToMessageId}\r\nReferences: ${inReplyToMessageId}\r\n`
    : ''
  const raw = Buffer.from(
    `From: ${from}\r\nTo: ${to}\r\n${ccLine}Subject: ${encodeSubject(subject)}\r\n${threadingLines}Content-Type: text/plain; charset=utf-8\r\n\r\n${fullBody}`
  ).toString('base64url')
  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, ...(replyToThreadId ? { threadId: replyToThreadId } : {}) },
  })
  if (booking_id) {
    logApiCost({ booking_id, api_type: 'email', call_type: 'send', cost_usd: 0, metadata: { to, subject } }).catch(() => {})
  }
  return result.data.id || null
}

export interface EmailSendResult {
  ok: boolean
  messageId?: string | null
  error?: string
}

export async function sendEmailSafe(opts: EmailMessage): Promise<EmailSendResult> {
  try {
    const messageId = await sendEmail(opts)
    return { ok: true, messageId }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[Gmail] Send failed to=${opts.to}:`, msg)
    return { ok: false, error: msg }
  }
}
