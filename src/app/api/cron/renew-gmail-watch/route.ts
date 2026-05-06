import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/server'

function getOAuthClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  )
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  return oauth2
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const querySecret = searchParams.get('secret')
  const validSecret = process.env.CRON_SECRET
  const isAuthorized =
    authHeader === `Bearer ${validSecret}` || querySecret === validSecret
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const auth = getOAuthClient()
    const gmail = google.gmail({ version: 'v1', auth })

    const { data } = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: process.env.GOOGLE_PUBSUB_TOPIC!,
        labelIds: ['INBOX'],
      },
    })

    const expiresAt = data.expiration
      ? new Date(parseInt(data.expiration)).toISOString()
      : null

    // Store historyId so the webhook uses it as startHistoryId on next notification
    if (data.historyId) {
      const supabase = createAdminClient()
      await supabase.from('app_settings').upsert({
        key: 'gmail_last_history_id',
        value: String(data.historyId),
        updated_at: new Date().toISOString(),
      })
    }

    console.log('[gmail-watch] Renewed. Expires:', expiresAt, '| historyId:', data.historyId)

    return NextResponse.json({ ok: true, expires_at: expiresAt, history_id: data.historyId })
  } catch (err) {
    console.error('[gmail-watch] Renewal failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
