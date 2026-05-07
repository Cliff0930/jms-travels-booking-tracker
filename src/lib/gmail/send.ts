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

interface EmailMessage {
  to: string
  subject: string
  body: string
  cc?: string[]
  skipSignature?: boolean
}

export async function sendEmail({ to, subject, body, cc, skipSignature = false }: EmailMessage): Promise<void> {
  const auth = getOAuthClient()
  const gmail = google.gmail({ version: 'v1', auth })
  const from = process.env.GMAIL_USER_EMAIL!

  const signature = skipSignature ? '' : await getSignature()
  const fullBody = skipSignature ? body : `${body}\n\n${signature}`

  const ccLine = cc?.length ? `Cc: ${cc.join(', ')}\r\n` : ''
  const raw = Buffer.from(
    `From: ${from}\r\nTo: ${to}\r\n${ccLine}Subject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${fullBody}`
  ).toString('base64url')
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}
