import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { google } from 'googleapis'
import { handleApprovalReply } from '@/lib/utils/approval-handler'

function getOAuthClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  )
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  return oauth2
}

export async function POST(request: Request) {
  const body = await request.json()
  const supabase = createAdminClient()

  try {
    const data = body?.message?.data
    if (!data) return NextResponse.json({ ok: true })

    const decoded = JSON.parse(Buffer.from(data, 'base64').toString())
    const historyId = decoded?.historyId

    if (!historyId) return NextResponse.json({ ok: true })

    const auth = getOAuthClient()
    const gmail = google.gmail({ version: 'v1', auth })

    console.log('[gmail-webhook] historyId from pubsub:', historyId)

    const { data: history } = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: String(parseInt(historyId) - 1),
      historyTypes: ['messageAdded'],
      labelId: 'INBOX',
    })

    const messageIds = history.history?.flatMap(h => h.messagesAdded?.map(m => m.message?.id) || []).filter(Boolean) || []
    console.log('[gmail-webhook] messageIds found:', messageIds.length, messageIds)

    for (const messageId of messageIds) {
      if (!messageId) continue
      const { data: msg } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })
      const headers = msg.payload?.headers || []
      const from = headers.find(h => h.name === 'From')?.value || ''
      const cc = headers.find(h => h.name === 'Cc')?.value || ''
      const replyTo = headers.find(h => h.name === 'Reply-To')?.value || ''

      console.log('[gmail-webhook] processing message from:', from, '| mimeType:', msg.payload?.mimeType, '| parts:', msg.payload?.parts?.map(p => p.mimeType))

      const emailMatch = from.match(/([^\s<]+@[^\s>]+)/)
      const senderEmail = emailMatch?.[1] || from
      const nameMatch = from.match(/^([^<]+)</)
      const senderName = nameMatch?.[1]?.trim()

      const ccEmails = cc ? cc.split(',').map(e => e.trim()).filter(Boolean) : []
      const replyToEmails = replyTo ? replyTo.split(',').map(e => e.trim()).filter(Boolean) : []

      let rawContent = ''
      const parts = msg.payload?.parts || [msg.payload]
      for (const part of parts) {
        if (part?.mimeType === 'text/plain' && part.body?.data) {
          rawContent = Buffer.from(part.body.data, 'base64').toString()
          break
        }
      }

      console.log('[gmail-webhook] rawContent length:', rawContent.length)
      if (!rawContent) {
        console.log('[gmail-webhook] skipping — no text/plain content found')
        continue
      }

      const handled = await handleApprovalReply(supabase, rawContent, null, senderEmail)
      if (handled) continue

      const { data: rawMsg } = await supabase
        .from('raw_messages')
        .insert({
          channel: 'email',
          sender_email: senderEmail,
          sender_name: senderName,
          cc_emails: ccEmails,
          reply_to_emails: replyToEmails,
          raw_content: rawContent,
        })
        .select()
        .single()

      if (!rawMsg) continue

      const { data: client } = await supabase
        .from('clients')
        .select('*, company:companies(*), locations:client_locations(*)')
        .eq('primary_email', senderEmail)
        .single()

      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/parse-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_message_id: rawMsg.id, client, message: rawContent, channel: 'email', sender_email: senderEmail }),
      })
    }
  } catch (err) {
    console.error('Gmail webhook error:', err)
  }

  return NextResponse.json({ ok: true })
}
