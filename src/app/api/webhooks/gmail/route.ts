import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { google } from 'googleapis'
import { handleApprovalReply } from '@/lib/utils/approval-handler'
import { fillMissingFromReply } from '@/lib/email/fill-missing'
import { notifyOperator } from '@/lib/utils/notify-operator'

function getGmailAuth() {
  const keyJson = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!, 'base64').toString()
  const key = JSON.parse(keyJson) as { client_email: string; private_key: string }
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    subject: process.env.GMAIL_USER_EMAIL,
  })
}

export async function POST(request: Request) {
  const body = await request.json()
  const supabase = createAdminClient()

  // Kill switch — checked once per webhook call before any Gemini work
  const { data: killSetting } = await supabase.from('app_settings').select('value').eq('key', 'ai_processing_enabled').single()
  const aiEnabled = killSetting?.value !== 'false'

  try {
    const data = body?.message?.data
    if (!data) return NextResponse.json({ ok: true })

    const decoded = JSON.parse(Buffer.from(data, 'base64').toString())
    const historyId = decoded?.historyId

    if (!historyId) return NextResponse.json({ ok: true })

    const auth = getGmailAuth()
    const gmail = google.gmail({ version: 'v1', auth })

    console.log('[gmail-webhook] notification historyId:', historyId)

    // Read last stored historyId — this is the correct startHistoryId for the history.list call
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'gmail_last_history_id')
      .single()

    const startHistoryId = setting?.value || String(parseInt(historyId) - 1)
    console.log('[gmail-webhook] using startHistoryId:', startHistoryId)

    // Advance the stored historyId BEFORE any async work so a second webhook call
    // triggered by our own outgoing email (which also advances Gmail history) reads
    // the updated ID and gets an empty history.list result rather than reprocessing
    // the same incoming email.
    await supabase
      .from('app_settings')
      .upsert({ key: 'gmail_last_history_id', value: String(historyId), updated_at: new Date().toISOString() })

    const { data: history } = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
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
      const rfcMessageId = headers.find(h => h.name === 'Message-ID')?.value || ''
      const gmailThreadId = (msg as Record<string, unknown>).threadId as string || ''
      const emailSubject = headers.find(h => h.name === 'Subject')?.value || ''

      // Skip messages older than 48 hours — protects against historyId backlog replay
      // billing thousands of old emails through Gemini. Real missed bookings need manual recovery.
      const msgAgeMs = Date.now() - parseInt((msg as Record<string, unknown>).internalDate as string || '0')
      if (msgAgeMs > 48 * 60 * 60 * 1000) {
        console.log('[gmail-webhook] skipping — message older than 48h:', messageId, 'age hours:', Math.round(msgAgeMs / 3600000))
        continue
      }

      console.log('[gmail-webhook] processing message from:', from, '| mimeType:', msg.payload?.mimeType, '| threadId:', gmailThreadId)

      const emailMatch = from.match(/([^\s<]+@[^\s>]+)/)
      const senderEmail = emailMatch?.[1] || from
      const nameMatch = from.match(/^([^<]+)</)
      const senderName = nameMatch?.[1]?.trim()

      // Skip emails sent FROM our own address — these are our own outgoing replies
      // landing back in the inbox via CC, which would create an infinite loop.
      const ownEmail = (process.env.GMAIL_USER_EMAIL || '').toLowerCase()
      if (ownEmail && senderEmail.toLowerCase() === ownEmail) {
        console.log('[gmail-webhook] skipping — email is from our own address:', senderEmail)
        continue
      }

      const ownEmailLower = ownEmail
      const ccEmails = cc ? cc.split(',').map(e => e.trim()).filter(e => {
        const m = e.match(/([^\s<]+@[^\s>]+)/)
        return m ? m[1].toLowerCase() !== ownEmailLower : e.toLowerCase() !== ownEmailLower
      }).filter(Boolean) : []
      const replyToEmails = replyTo ? replyTo.split(',').map(e => e.trim()).filter(Boolean) : []

      // Extract extra To recipients (beyond our own address) and merge with CC
      // so all parties on the original email receive our reply
      const toHeader = headers.find(h => h.name === 'To')?.value || ''
      const extraToEmails = toHeader ? toHeader.split(',').map(e => e.trim()).filter(e => {
        const m = e.match(/([^\s<]+@[^\s>]+)/)
        return m ? m[1].toLowerCase() !== ownEmailLower : e.toLowerCase() !== ownEmailLower
      }).filter(Boolean) : []
      const allCcEmails = [...ccEmails, ...extraToEmails]

      function extractPlainText(payload: typeof msg.payload): string {
        if (!payload) return ''
        if (payload.mimeType === 'text/plain' && payload.body?.data) {
          return Buffer.from(payload.body.data, 'base64').toString()
        }
        for (const part of payload.parts || []) {
          const found = extractPlainText(part)
          if (found) return found
        }
        return ''
      }

      function extractHtmlText(payload: typeof msg.payload): string {
        if (!payload) return ''
        if (payload.mimeType === 'text/html' && payload.body?.data) {
          return Buffer.from(payload.body.data, 'base64').toString()
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
        }
        for (const part of payload.parts || []) {
          const found = extractHtmlText(part)
          if (found) return found
        }
        return ''
      }

      let rawContent = extractPlainText(msg.payload) || extractHtmlText(msg.payload)

      // Prepend subject so Gemini can read it — corporate clients often put dates/destinations there
      if (emailSubject) {
        rawContent = `Subject: ${emailSubject}\n\n${rawContent}`
      }

      console.log('[gmail-webhook] rawContent length:', rawContent.length)
      if (!rawContent) {
        console.log('[gmail-webhook] skipping — no text/plain content found')
        continue
      }

      const handled = await handleApprovalReply(supabase, rawContent, null, senderEmail)
      if (handled) continue

      // Check if this email is a reply to an existing draft booking awaiting missing info
      // Skip fill-missing if the email looks like a cancel/modify — let full AI processing handle it
      const isCancelOrModify = /\b(cancel|called off|not required|not needed|no longer require|withdraw|scratch that|trip cancelled|reschedule|postpone|modify|change the|update (the )?booking|push (the )?booking|shift (the )?booking|earlier time|later time|different date)\b/i.test(rawContent)

      if (gmailThreadId && !isCancelOrModify) {
        const { data: draftBooking } = await supabase
          .from('bookings')
          .select('*, client:clients!client_id(*, locations:client_locations(*))')
          .eq('gmail_thread_id', gmailThreadId)
          .eq('status', 'draft')
          .maybeSingle()

        if (draftBooking) {
          console.log('[gmail-webhook] reply matched draft booking:', draftBooking.booking_ref)
          await fillMissingFromReply(supabase, draftBooking, rawContent, senderEmail, allCcEmails, gmailThreadId, rfcMessageId)
          continue
        }
      }

      // Apply per-company email intake rules based on sender domain
      const senderDomain = senderEmail.split('@')[1]?.toLowerCase()
      let skipApproval = false

      if (senderDomain) {
        const { data: domainCompanies } = await supabase
          .from('companies')
          .select('id, email_intake_mode, direct_booking_emails, email_domains')
          .contains('email_domains', [senderDomain])
          .limit(1)

        const matchedCompany = domainCompanies?.[0]
        if (matchedCompany) {
          const mode = matchedCompany.email_intake_mode || 'domain'
          if (mode === 'off') {
            console.log('[gmail-webhook] skipping — email_intake_mode is off for domain:', senderDomain)
            continue
          }
          if (mode === 'specific_senders') {
            const allowed: string[] = matchedCompany.direct_booking_emails || []
            if (!allowed.includes(senderEmail)) {
              console.log('[gmail-webhook] skipping — sender not in direct_booking_emails:', senderEmail)
              continue
            }
            skipApproval = true
            console.log('[gmail-webhook] direct sender matched — skip_approval=true')
          }
        }
      }

      const { data: insertedMsg, error: upsertError } = await supabase
        .from('raw_messages')
        .upsert({
          channel: 'email',
          sender_email: senderEmail,
          sender_name: senderName,
          cc_emails: allCcEmails,
          reply_to_emails: replyToEmails,
          raw_content: rawContent,
          gmail_message_id: messageId,
        }, { onConflict: 'gmail_message_id', ignoreDuplicates: true })
        .select()
        .single()

      let rawMsg = insertedMsg
      if (!rawMsg) {
        const { data: existingMsg } = await supabase
          .from('raw_messages')
          .select('id, processed')
          .eq('gmail_message_id', messageId)
          .single()

        if (!existingMsg) {
          console.error('[gmail-webhook] upsert failed and no existing row found. upsertError:', upsertError, '| messageId:', messageId)
          continue
        }
        if (existingMsg.processed) {
          console.log('[gmail-webhook] skipping duplicate messageId (already processed):', messageId)
          continue
        }
        console.log('[gmail-webhook] retrying unprocessed duplicate messageId:', messageId)
        rawMsg = existingMsg as typeof rawMsg
      }

      const { data: client } = await supabase
        .from('clients')
        .select('*, company:companies!company_id(*), locations:client_locations(*)')
        .eq('primary_email', senderEmail)
        .single()

      if (!aiEnabled) {
        console.log('[gmail] AI processing disabled — email stored, skipping Gemini for', senderEmail)
        continue
      }

      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/parse-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_message_id: rawMsg.id, client, message: rawContent, channel: 'email', sender_email: senderEmail, sender_name: senderName, cc_emails: allCcEmails, gmail_thread_id: gmailThreadId || null, original_message_id: rfcMessageId || null, skip_auto_reply: false, skip_approval: skipApproval }),
      })
    }
  } catch (err) {
    console.error('Gmail webhook error:', err)
    await notifyOperator(`🔴 Gmail webhook crashed!\n\nError: ${String(err).slice(0, 300)}\n\nCheck Vercel logs. Incoming email may not have been processed.`).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
