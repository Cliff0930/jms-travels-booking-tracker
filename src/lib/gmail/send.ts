import { google } from 'googleapis'
import { logApiCost } from '@/lib/api-costs'

const DEFAULT_SIGNATURE = `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;max-width:500px;width:100%;">
<tr><td style="border-top:3px solid #0d9e9c;padding-top:18px;">
<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;">
<tr>
<td style="width:114px;vertical-align:middle;padding-right:20px;">
<img src="https://booking.jmstravels.net/jms-logo.png" alt="JMS Travel" width="100" height="100" style="display:block;width:100px;height:100px;object-fit:contain;" />
</td>
<td style="width:1px;background-color:#cde8e8;vertical-align:middle;"><div style="width:1px;height:90px;background:#cde8e8;">&nbsp;</div></td>
<td style="vertical-align:middle;padding-left:20px;">
<div style="font-size:15px;font-weight:700;color:#0d9e9c;letter-spacing:0.2px;margin-bottom:2px;">JMS Travel Team</div>
<div style="font-size:10.5px;color:#9ca3af;text-transform:uppercase;letter-spacing:1.6px;margin-bottom:12px;">Operations</div>
<div style="font-size:12.5px;color:#374151;margin-bottom:5px;"><span style="color:#0d9e9c;font-weight:700;font-size:11px;margin-right:7px;">P</span><a href="tel:+919845572207" style="color:#374151;text-decoration:none;">+91 98455 72207</a></div>
<div style="font-size:12.5px;margin-bottom:11px;"><span style="color:#0d9e9c;font-weight:700;font-size:11px;margin-right:7px;">E</span><a href="mailto:bookings@jmstravels.net" style="color:#0d9e9c;text-decoration:none;">bookings@jmstravels.net</a><span style="color:#d1d5db;margin:0 6px;">|</span><a href="https://www.jmstravels.net" style="color:#0d9e9c;text-decoration:none;">www.jmstravels.net</a></div>
<div style="font-size:11px;color:#9ca3af;line-height:1.65;border-top:1px solid #f0f0f0;padding-top:9px;">14/17, 15th Cross Road, Eshwara Layout, Indiranagar<br />Bengaluru, Karnataka 560038</div>
</td>
</tr>
</table>
<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;margin-top:14px;">
<tr><td style="border-top:1px solid #f0f0f0;padding-top:10px;"><div style="font-size:10.5px;color:#b0c4c4;font-style:italic;letter-spacing:0.4px;">we take pride in your ride</div></td></tr>
</table>
</td></tr>
</table>`

function getSignature(): string {
  return DEFAULT_SIGNATURE
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

  const signature = skipSignature ? '' : getSignature()
  const htmlBody = body
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />\n')
  const fullBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333333;line-height:1.65;">${htmlBody}</div>${skipSignature ? '' : `<br /><br />${signature}`}</body></html>`

  const safeCc = cc?.filter(e => !e.toLowerCase().includes(from.toLowerCase()))
  const ccLine = safeCc?.length ? `Cc: ${safeCc.join(', ')}\r\n` : ''
  const threadingLines = inReplyToMessageId
    ? `In-Reply-To: ${inReplyToMessageId}\r\nReferences: ${inReplyToMessageId}\r\n`
    : ''
  const raw = Buffer.from(
    `From: ${from}\r\nTo: ${to}\r\n${ccLine}Subject: ${encodeSubject(subject)}\r\n${threadingLines}Content-Type: text/html; charset=utf-8\r\n\r\n${fullBody}`
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
