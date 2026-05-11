import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/server'

const DEFAULT_SIGNATURE = `Best regards,

JMS Travels
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

function getOAuthClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  )
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  return oauth2
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
}

export async function sendEmail({ to, subject, body, cc, skipSignature = false, replyToThreadId, inReplyToMessageId }: EmailMessage): Promise<string | null> {
  // Kill switch — set EMAIL_KILL_SWITCH=true in Vercel env to block all outgoing email
  if (process.env.EMAIL_KILL_SWITCH === 'true') {
    console.log('[sendEmail] kill switch active — skipping send to:', to, '| subject:', subject)
    return null
  }
  const auth = getOAuthClient()
  const gmail = google.gmail({ version: 'v1', auth })
  const from = process.env.GMAIL_USER_EMAIL!

  const signature = skipSignature ? '' : await getSignature()
  const fullBody = skipSignature ? body : `${body}\n\n${signature}`

  const ccLine = cc?.length ? `Cc: ${cc.join(', ')}\r\n` : ''
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
  return result.data.id || null
}
