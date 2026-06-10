import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { classifyAndExtract } from '@/lib/gemini/classify-and-extract'
import { logApiCost, calcGeminiCost } from '@/lib/api-costs'
import type { ExtractedFields } from '@/lib/gemini/extract'
import { fillTemplate, TEMPLATE_KEYS } from '@/lib/templates'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import { sendEmail } from '@/lib/gmail/send'
import { notifyOperator } from '@/lib/utils/notify-operator'
import { handleEmailCancel, handleEmailModify } from '@/lib/email/handle-change'
import { findOrCreateGuestClient } from '@/lib/utils/guest-client'
import { isAfterHours, sendAfterHoursNotices } from '@/lib/utils/after-hours'
import { formatDate, formatTime } from '@/lib/utils/date'
import type { Client, ClientLocation, Company } from '@/types'
import { formalName, extractHonorific } from '@/lib/utils/client-name'

// Fast regex pre-filter — skips Gemini for obvious system/automated emails
function isObviousJunk(content: string, senderEmail?: string): boolean {
  if (/\b(out of office|automatic reply|auto.?reply|away from|vacation response)\b/i.test(content)) return true
  if (/\b(mail delivery (failed|failure)|mailer-daemon|undeliverable|delivery status notification)\b/i.test(content)) return true
  if (/\b(otp|one.time.password|verification code)\b/i.test(content) && content.length < 400) return true
  if (/\b(neft|imps|rtgs|credited|debited|transaction alert)\b/i.test(content) && !/\b(cab|travel|book|pickup|drop)\b/i.test(content)) return true
  if (/unsubscribe|newsletter|no-reply@|noreply@/i.test(senderEmail || '') || /unsubscribe from/i.test(content)) return true
  return false
}

function getTodayIST(): string {
  const istOffset = 5.5 * 60 * 60 * 1000
  return new Date(Date.now() + istOffset).toISOString().slice(0, 10)
}

function extractMapsUrls(text: string): { pickup_location_url: string | null; drop_location_url: string | null } {
  const urlRegex = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com|www\.google\.com\/maps|google\.com\/maps)[^\s]*/gi
  const matches = [...text.matchAll(urlRegex)]
  if (matches.length === 0) return { pickup_location_url: null, drop_location_url: null }

  let pickupUrl: string | null = null
  let dropUrl: string | null = null

  for (const match of matches) {
    const url = match[0]
    const pos = match.index ?? 0
    const surroundingText = text.slice(Math.max(0, pos - 80), pos + url.length + 80).toLowerCase()
    const isDropContext = /\b(drop|destination|to\s*:|dropping|reach|arrive)\b/.test(surroundingText)
    const isPickupContext = /\b(pick\s*up|pickup|from\s*:|departing|start|board)\b/.test(surroundingText)

    if (isDropContext && !dropUrl) {
      dropUrl = url
    } else if (isPickupContext && !pickupUrl) {
      pickupUrl = url
    } else if (!pickupUrl) {
      pickupUrl = url
    } else if (!dropUrl) {
      dropUrl = url
    }
  }

  return { pickup_location_url: pickupUrl, drop_location_url: dropUrl }
}


function buildWhatsAppConfirmation(
  clientName: string,
  bookingRef: string,
  extracted: ExtractedFields,
): string {
  const tripLabel: Record<string, string> = { local: 'Local', outstation: 'Outstation', airport: 'Airport' }
  const lines = [`Hi ${clientName}, your booking is confirmed.`, ``, `Ref: ${bookingRef}`]
  if (extracted.pickup_location) lines.push(`Pickup: ${extracted.pickup_location}`)
  if (extracted.drop_location)   lines.push(`Drop: ${extracted.drop_location}`)
  if (extracted.pickup_date)     lines.push(`Date: ${formatDate(extracted.pickup_date)}`)
  if (extracted.pickup_time)     lines.push(`Time: ${formatTime(extracted.pickup_time)}`)
  lines.push(`Trip: ${tripLabel[extracted.trip_type] ?? extracted.trip_type}`)
  if ((extracted.total_days ?? 1) > 1) lines.push(`Days: ${extracted.total_days}`)
  if (extracted.special_instructions) lines.push(`Note: ${extracted.special_instructions}`)
  lines.push(``, `We will share your driver details once assigned. Thank you!`, ``, `JMS Travels Team`)
  return lines.join('\n')
}

function buildMultiBookingEmailBody(clientName: string, bookings: Array<{ ref: string; extracted: ExtractedFields }>): string {
  const lines = [
    `Hi ${clientName},`,
    ``,
    `We have received your ${bookings.length} booking requests. Here is a summary:`,
    ``,
  ]
  bookings.forEach(({ ref, extracted }, i) => {
    lines.push(`${i + 1}. Ref: ${ref}`)
    if (extracted.pickup_date) lines.push(`   Date    : ${formatDate(extracted.pickup_date)}${extracted.pickup_time ? ` at ${formatTime(extracted.pickup_time)}` : ''}`)
    if (extracted.pickup_location) lines.push(`   Pickup  : ${extracted.pickup_location}`)
    if (extracted.drop_location)   lines.push(`   Drop    : ${extracted.drop_location}`)
    if (extracted.guest_name)      lines.push(`   Guest   : ${extracted.guest_name}`)
    if (extracted.special_instructions) lines.push(`   Note    : ${extracted.special_instructions}`)
    lines.push(``)
  })
  lines.push(`We will share driver details once assigned. Thank you for choosing JMS Travels.`)
  return lines.join('\n')
}

async function logOutbound(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    bookingId: string
    clientId: string | null | undefined
    channel: string
    recipient: string | null | undefined
    body: string
    templateKey: string
    status: string
  }
) {
  await supabase.from('message_logs').insert({
    booking_id: params.bookingId,
    client_id: params.clientId,
    channel: params.channel,
    direction: 'outbound',
    recipient: params.recipient,
    content: params.body,
    template_used: params.templateKey,
    status: params.status,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findBookingForCancelModify(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string | null,
  targetRef: string | null,
  gmailThreadId: string | null,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ booking: Record<string, any> | null; found: 'ref' | 'thread' | 'single' | null }> {
  if (targetRef) {
    const { data } = await supabase
      .from('bookings')
      .select('*, driver:drivers!driver_id(name, phone)')
      .eq('booking_ref', targetRef)
      .not('status', 'in', '("completed","cancelled")')
      .maybeSingle()
    if (data) return { booking: data, found: 'ref' }
  }
  if (gmailThreadId) {
    const { data } = await supabase
      .from('bookings')
      .select('*, driver:drivers!driver_id(name, phone)')
      .eq('gmail_thread_id', gmailThreadId)
      .not('status', 'in', '("completed","cancelled")')
      .maybeSingle()
    if (data) return { booking: data, found: 'thread' }
  }
  if (clientId) {
    const { data } = await supabase
      .from('bookings')
      .select('*, driver:drivers!driver_id(name, phone)')
      .eq('client_id', clientId)
      .not('status', 'in', '("completed","cancelled")')
      .limit(2)
    if (data?.length === 1) return { booking: data[0], found: 'single' }
  }
  return { booking: null, found: null }
}

export async function POST(request: Request) {
  const { raw_message_id, client: clientFromReq, message, channel, sender_email, sender_name, sender_phone, cc_emails, gmail_thread_id, original_message_id, skip_auto_reply, skip_approval } = await request.json()
  let client = clientFromReq
  const supabase = createAdminClient()

  try {
    // Hard block: never process emails from our own address — prevents booking loops
    if (sender_email && sender_email.toLowerCase() === 'bookings@jmstravels.net') {
      if (raw_message_id) await supabase.from('raw_messages').update({ ai_classification: 'junk', processed: true, processed_at: new Date().toISOString() }).eq('id', raw_message_id)
      return NextResponse.json({ ok: true, classification: 'self_email_skip' })
    }

    // Free regex pre-filter before Gemini — catches auto-replies, bank alerts, newsletters
    if (channel === 'email' && isObviousJunk(message, sender_email)) {
      await supabase.from('raw_messages').update({ ai_classification: 'junk', processed: true, processed_at: new Date().toISOString() }).eq('id', raw_message_id)
      return NextResponse.json({ ok: true, classification: 'junk' })
    }

    // ── Cost protection: global circuit breaker ──────────────────────────────
    // If 50+ messages arrived in the last 5 minutes across ALL senders, something
    // is looping. Pause Gemini calls and alert operator immediately.
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { count: recentTotal } = await supabase
      .from('raw_messages')
      .select('*', { count: 'exact', head: true })
      .gt('received_at', fiveMinAgo)
    if ((recentTotal ?? 0) >= 50) {
      await supabase.from('raw_messages').update({ ai_classification: 'circuit_breaker', processed: true, processed_at: new Date().toISOString() }).eq('id', raw_message_id)
      notifyOperator(
        `🔴 CIRCUIT BREAKER triggered!\n\n50+ messages received in the last 5 minutes — possible loop detected. Gemini calls paused.\n\nChannel: ${channel} | From: ${sender_email || sender_phone || 'unknown'}\n\nCheck raw_messages table immediately.`
      ).catch(() => {})
      return NextResponse.json({ ok: true, classification: 'circuit_breaker' })
    }

    // ── Cost protection: per-sender rate limit ───────────────────────────────
    // If the same sender has 10+ messages processed in the last 60 minutes,
    // they're either in a loop or hammering the system. Skip Gemini, alert operator.
    const senderKey = sender_email || sender_phone || null
    if (senderKey) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { count: senderCount } = await supabase
        .from('raw_messages')
        .select('*', { count: 'exact', head: true })
        .or(`sender_email.eq.${senderKey},sender_phone.eq.${senderKey}`)
        .gt('received_at', oneHourAgo)
      if ((senderCount ?? 0) >= 10) {
        await supabase.from('raw_messages').update({ ai_classification: 'rate_limited', processed: true, processed_at: new Date().toISOString() }).eq('id', raw_message_id)
        notifyOperator(
          `⚠️ Rate limit hit!\n\nSender: ${senderKey} has sent 10+ messages in the last hour on ${channel}. Gemini call skipped.\n\nCheck raw_messages if a real booking was missed.`,
          'ops'
        ).catch(() => {})
        console.log('[parse-message] rate limit hit for sender:', senderKey, 'count:', senderCount)
        return NextResponse.json({ ok: true, classification: 'rate_limited' })
      }
    }

    const savedLocations: ClientLocation[] = (client as Client & { locations?: ClientLocation[] })?.locations || []
    const mapsUrls = extractMapsUrls(message)
    const result = await classifyAndExtract(message, client, savedLocations)

    await supabase
      .from('raw_messages')
      .update({ ai_classification: result.classification, ai_confidence: result.confidence, processed: true, processed_at: new Date().toISOString() })
      .eq('id', raw_message_id)

    if (result.classification === 'junk') {
      return NextResponse.json({ ok: true, classification: 'junk' })
    }

    if (result.classification === 'enquiry' || result.classification === 'unclassified') {
      const replyTo = channel === 'whatsapp' ? (sender_phone || (client as Client)?.primary_phone) : null
      if (channel === 'whatsapp' && replyTo) {
        const reply = result.classification === 'enquiry'
          ? 'For rates and pricing information, please call us at 9845572207. We are happy to help!'
          : 'For any queries or assistance, please call us at 9845572207.'
        await sendWhatsAppMessage({ to: replyTo, body: reply })
      }
      return NextResponse.json({ ok: true, classification: result.classification })
    }

    if (result.classification === 'cancel_request' || result.classification === 'modify_request') {
      if (channel !== 'email' || !sender_email) {
        return NextResponse.json({ ok: true, classification: result.classification })
      }
      const threading = {
        replyToThreadId: gmail_thread_id || undefined,
        inReplyToMessageId: original_message_id || undefined,
      }
      const ccForReply = Array.isArray(cc_emails) && cc_emails.length > 0 ? cc_emails as string[] : undefined
      const emailClient = client as Client | null
      const clientName = formalName(
        emailClient?.name || sender_name || 'there',
        emailClient?.salutation,
        (emailClient?.company as Company | null)?.formal_address,
      )

      const { booking } = await findBookingForCancelModify(
        supabase,
        (client as Client)?.id ?? null,
        result.target_booking_ref,
        gmail_thread_id || null,
      )

      if (booking) {
        await supabase.from('raw_messages').update({ booking_id: booking.id as string }).eq('id', raw_message_id)
      }

      if (!booking) {
        const subjPrefix = result.classification === 'cancel_request' ? 'Cancellation request' : 'Change request'
        await sendEmail({
          to: sender_email,
          subject: `${subjPrefix} — booking reference needed`,
          cc: ccForReply,
          ...threading,
          body: [
            `Hi ${clientName},`,
            ``,
            result.classification === 'cancel_request'
              ? `We received your cancellation request but could not identify which booking you'd like to cancel.`
              : `We received your change request but could not identify which booking you'd like to modify.`,
            ``,
            `Please reply with your booking reference (e.g. BK-1234) and we will process it right away.`,
            ``,
            `JMS Travels Team`,
          ].join('\n'),
        }).catch(() => {})
        return NextResponse.json({ ok: true, classification: result.classification })
      }

      if (result.classification === 'cancel_request') {
        await handleEmailCancel(supabase, booking, clientName, sender_email, ccForReply, result.cancel_reason, threading)
      } else {
        await handleEmailModify(supabase, booking, clientName, sender_email, ccForReply, result.modification_request, threading, getTodayIST())
      }
      return NextResponse.json({ ok: true, classification: result.classification, booking_id: booking.id as string })
    }

    // Booking flow
    const extraction = result
    const today = getTodayIST()

    // Sanitise past dates in all bookings
    for (const bk of extraction.bookings) {
      if (bk.extracted.pickup_date && bk.extracted.pickup_date < today) {
        bk.extracted.pickup_date = null
        if (!bk.missing_mandatory.includes('pickup_date')) bk.missing_mandatory.push('pickup_date')
      }
    }

    const allMissing = extraction.bookings.flatMap(b => b.missing_mandatory)

    await supabase
      .from('raw_messages')
      .update({ ai_extracted_fields: extraction.bookings[0]?.extracted, ai_missing_fields: allMissing })
      .eq('id', raw_message_id)

    // Auto-create client from email if not found in database
    if (!client && channel === 'email' && sender_email) {
      const rawName = sender_name || sender_email.split('@')[0]
      const { cleanName: name, salutation: emailSalutation } = extractHonorific(rawName)
      // Try to match company by email domain so the new client gets company_id
      // (required for approval routing to work on the very first booking)
      const senderDomain = sender_email.split('@')[1]?.toLowerCase()
      let autoCompanyId: string | null = null
      if (senderDomain) {
        const { data: domainMatch } = await supabase
          .from('companies')
          .select('id')
          .contains('email_domains', [senderDomain])
          .limit(1)
        autoCompanyId = domainMatch?.[0]?.id ?? null
      }
      const { data: newClient } = await supabase
        .from('clients')
        .insert({ name, salutation: emailSalutation, primary_email: sender_email, client_type: autoCompanyId ? 'corporate' : 'walkin', company_id: autoCompanyId })
        .select('*, company:companies!company_id(*), locations:client_locations(*)')
        .single()
      if (newClient) {
        client = newClient
        console.log('[parse-message] auto-created client:', newClient.id, name, 'company:', autoCompanyId)
      }
    }

    // Create one booking per extracted entry
    const createdBookings: Array<{ booking: { id: string; booking_ref: string }; extracted: ExtractedFields }> = []

    for (let i = 0; i < extraction.bookings.length; i++) {
      const bk = extraction.bookings[i]

      // Cross-channel duplicate guard: same client + same date + same time within 2 hours
      if ((client as Client)?.id && bk.extracted.pickup_date && bk.extracted.pickup_time) {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        const { data: dupBooking } = await supabase
          .from('bookings')
          .select('id, booking_ref, source')
          .eq('client_id', (client as Client).id)
          .eq('pickup_date', bk.extracted.pickup_date)
          .eq('pickup_time', bk.extracted.pickup_time)
          .in('status', ['draft', 'pending', 'pending_approval'])
          .gt('created_at', twoHoursAgo)
          .maybeSingle()

        if (dupBooking) {
          await supabase.from('raw_messages')
            .update({ ai_classification: 'duplicate', processed: true, processed_at: new Date().toISOString() })
            .eq('id', raw_message_id)
          notifyOperator(
            `⚠️ Duplicate booking blocked!\n\nExisting: ${dupBooking.booking_ref} (via ${dupBooking.source})\nNew attempt via ${channel} from ${sender_email || sender_phone || 'unknown'}\nDate: ${bk.extracted.pickup_date} at ${bk.extracted.pickup_time}\n\nNo new booking created. Review if intentional.`,
            'ops'
          ).catch(() => {})
          continue
        }
      }

      // Strip honorific prefix from guest name before saving
      let guestSalutation: 'sir' | 'madam' | null = null
      if (bk.extracted.guest_name) {
        const { cleanName, salutation: sal } = extractHonorific(bk.extracted.guest_name)
        bk.extracted.guest_name = cleanName
        guestSalutation = sal
      }

      const flags: string[] = []
      if (!bk.extracted.pickup_location) flags.push('missing_pickup')
      if (!bk.extracted.pickup_date)     flags.push('missing_date')
      if (!bk.extracted.pickup_time)     flags.push('missing_time')
      if (!(client as Client)?.company_id) flags.push('unknown_company')
      if (!bk.extracted.drop_location)   flags.push('missing_drop')
      if (bk.is_guest_booking && !(client as Client)?.id) flags.push('guest_booking')

      const { data: booking } = await supabase
        .from('bookings')
        .insert({
          client_id: (client as Client)?.id || null,
          company_id: (client as Client)?.company_id || null,
          status: 'draft',
          source: channel,
          requested_by: sender_email || sender_phone || null,
          flags,
          cc_emails: (channel === 'email' && Array.isArray(cc_emails) && cc_emails.length > 0) ? cc_emails : null,
          gmail_thread_id: (channel === 'email' && gmail_thread_id) ? gmail_thread_id : null,
          pickup_location: bk.extracted.pickup_location,
          drop_location: bk.extracted.drop_location,
          pickup_location_url: mapsUrls.pickup_location_url,
          drop_location_url: mapsUrls.drop_location_url,
          pickup_date: bk.extracted.pickup_date,
          pickup_time: bk.extracted.pickup_time,
          pax_count: bk.extracted.pax_count,
          vehicle_type: bk.extracted.vehicle_type,
          guest_name: bk.extracted.guest_name,
          guest_phone: bk.extracted.guest_phone,
          trip_type: bk.extracted.trip_type,
          service_type: bk.extracted.service_type,
          total_days: bk.extracted.total_days,
          special_instructions: bk.extracted.special_instructions,
          booking_type: (client as Client)?.company_id ? 'company' : 'personal',
        })
        .select('id, booking_ref')
        .single()

      if (!booking) continue

      createdBookings.push({ booking, extracted: bk.extracted })

      // Log Gemini cost against the first booking created
      if (i === 0 && result._usage) {
        const { tokens_in, tokens_out } = result._usage
        logApiCost({ booking_id: booking.id as string, api_type: 'gemini', call_type: 'classify_extract', tokens_in, tokens_out, cost_usd: calcGeminiCost(tokens_in, tokens_out) }).catch(() => {})
      }

      // Link first booking to the raw message
      if (i === 0) {
        await supabase.from('raw_messages').update({ booking_id: booking.id }).eq('id', raw_message_id)
      }

      // Save new client location keyword (first booking only — per-client)
      if (i === 0 && extraction.new_keyword_detected && booking && (client as Client)?.id) {
        const keyword = extraction.new_keyword_detected
        const resolvedAddress = extraction.resolved_keywords?.[keyword]
        if (resolvedAddress) {
          try {
            await supabase.from('client_locations')
              .upsert({ client_id: (client as Client)!.id, keyword, address: resolvedAddress }, { onConflict: 'client_id,keyword' })
          } catch { /* non-critical */ }
        }
      }

      await supabase.from('booking_status_history').insert({ booking_id: booking.id, new_status: 'draft', changed_by: 'system' })

      // Auto-create or reuse guest client profile and link to booking
      if (bk.extracted.guest_name) {
        try {
          const guestClientId = await findOrCreateGuestClient(supabase, {
            guestName: bk.extracted.guest_name,
            guestPhone: bk.extracted.guest_phone,
            companyId: (client as Client)?.company_id ?? null,
            salutation: guestSalutation,
          })
          if (guestClientId) {
            await supabase.from('bookings').update({ guest_client_id: guestClientId }).eq('id', booking.id)
          }
        } catch { /* non-critical */ }
      }

      // Possible-duplicate detection — mirrors /api/bookings logic so dashboard warning shows
      if (bk.extracted.pickup_date && (client as Client)?.id) {
        try {
          const { data: sameDay } = await supabase
            .from('bookings')
            .select('id, flags, booking_ref, guest_name, pickup_location')
            .eq('client_id', (client as Client).id)
            .eq('pickup_date', bk.extracted.pickup_date)
            .not('status', 'in', '("cancelled","completed")')
            .neq('id', booking.id)

          const guestFirst = bk.extracted.guest_name?.toLowerCase().split(' ')[0] ?? ''
          const locFirst   = bk.extracted.pickup_location?.toLowerCase().split(' ').slice(0, 3).join(' ') ?? ''

          const matches = (sameDay ?? []).filter(s => {
            if (guestFirst && s.guest_name?.toLowerCase().includes(guestFirst)) return true
            if (locFirst   && s.pickup_location?.toLowerCase().includes(locFirst)) return true
            return false
          })

          if (matches.length > 0) {
            await supabase.from('bookings')
              .update({ flags: [...(flags as string[] || []), 'possible_duplicate'] })
              .eq('id', booking.id)
            for (const m of matches) {
              const mFlags = (m.flags as string[] | null) ?? []
              if (!mFlags.includes('possible_duplicate')) {
                await supabase.from('bookings').update({ flags: [...mFlags, 'possible_duplicate'] }).eq('id', m.id)
              }
            }
          }
        } catch { /* non-critical */ }
      }

      // needs_clarification flag — set when Gemini marked ambiguous details with ⚠️ CLARIFY:
      if (bk.extracted.special_instructions?.includes('⚠️ CLARIFY:')) {
        try {
          await supabase.from('bookings')
            .update({ flags: [...(flags as string[] || []), 'needs_clarification'] })
            .eq('id', booking.id)
        } catch { /* non-critical */ }
      }
    }

    if (createdBookings.length === 0) {
      return NextResponse.json({ ok: true, booking_id: null })
    }

    const firstBookingId = createdBookings[0].booking.id
    const emailClient2 = client as Client | null
    const clientName = formalName(
      emailClient2?.name || 'there',
      emailClient2?.salutation,
      (emailClient2?.company as Company | null)?.formal_address,
    )
    const emailCc = Array.isArray(cc_emails) && cc_emails.length > 0 ? cc_emails : undefined

    // Notify operator of every new booking — fire and forget
    {
      const refs = createdBookings.map(b => b.booking.booking_ref).join(', ')
      const firstExt = createdBookings[0].extracted
      const statusNote = allMissing.length > 0 ? `⚠️ Missing: ${allMissing.map(f => f.replace(/_/g, ' ')).join(', ')}` : '✅ All fields complete'
      const lines = [
        `📩 New ${createdBookings.length > 1 ? `${createdBookings.length} bookings` : 'booking'} via ${channel}`,
        `From: ${sender_email || sender_phone || 'unknown'}`,
        `Ref: ${refs}`,
        firstExt.pickup_date ? `Date: ${firstExt.pickup_date}${firstExt.pickup_time ? ` ${firstExt.pickup_time}` : ''}` : null,
        firstExt.pickup_location ? `Pickup: ${firstExt.pickup_location}` : null,
        statusNote,
      ].filter(Boolean).join('\n')
      notifyOperator(lines, 'ops').catch(() => {})
    }

    // If any mandatory fields are missing, send one combined reply
    if (allMissing.length > 0) {
      if (!skip_auto_reply) {
        const templateKey = TEMPLATE_KEYS.MISSING_INFO_REQUEST
        const { data: tmpl } = await supabase.from('message_templates').select('body, subject').eq('template_key', templateKey).single()
        const isPastDateOnly = allMissing.length === 1 && allMissing[0] === 'pickup_date'
        const missingList = isPastDateOnly
          ? 'pickup date (the date provided appears to be in the past — please provide a future date)'
          : allMissing.map(f => f.replace(/_/g, ' ')).join(', ')
        const recipient = channel === 'whatsapp' ? ((client as Client)?.primary_phone || sender_phone) : sender_email

        if (tmpl && recipient) {
          const body = fillTemplate(tmpl.body, { client_name: clientName, missing_fields_list: missingList, booking_ref: createdBookings[0].booking.booking_ref })
          let status = 'failed'
          if (channel === 'whatsapp') {
            const result = await sendWhatsAppMessage({ to: recipient, body })
            status = result.ok ? 'sent' : `failed: ${result.error}`
          } else if (channel === 'email') {
            try {
              await sendEmail({
                to: recipient,
                subject: fillTemplate(tmpl.subject || '', { booking_ref: createdBookings[0].booking.booking_ref }),
                body,
                cc: emailCc,
                replyToThreadId: gmail_thread_id || undefined,
                inReplyToMessageId: original_message_id || undefined,
              })
              status = 'sent'
            } catch (e) { status = `failed: ${String(e)}` }
          }
          await logOutbound(supabase, { bookingId: firstBookingId, clientId: (client as Client)?.id, channel, recipient, body, templateKey, status })
        }
      }
      return NextResponse.json({ ok: true, booking_id: firstBookingId, booking_ids: createdBookings.map(b => b.booking.id), missing: allMissing })
    }

    // Check if approval required
    if (!skip_approval && (client as Client)?.company_id) {
      const { data: company } = await supabase.from('companies').select('approval_required').eq('id', (client as Client).company_id!).single()
      if (company?.approval_required) {
        for (const { booking } of createdBookings) {
          await supabase.from('bookings').update({ status: 'pending_approval', approval_status: 'pending' }).eq('id', booking.id)
          await supabase.from('booking_status_history').insert({ booking_id: booking.id, old_status: 'draft', new_status: 'pending_approval', changed_by: 'system' })
        }
        return NextResponse.json({ ok: true, booking_id: firstBookingId, booking_ids: createdBookings.map(b => b.booking.id), requires_approval: true })
      }
    }

    if (skip_auto_reply) return NextResponse.json({ ok: true, booking_id: firstBookingId, booking_ids: createdBookings.map(b => b.booking.id) })

    // If any booking needs clarification, send a generic "received" ack (Option B) instead of detailed confirmation
    const anyNeedsClarification = createdBookings.some(cb => cb.extracted.special_instructions?.includes('⚠️ CLARIFY:'))
    if (anyNeedsClarification) {
      const clarifyRecipient = channel === 'whatsapp'
        ? ((client as Client)?.primary_phone || sender_phone)
        : (sender_email || (client as Client)?.primary_email)
      if (clarifyRecipient) {
        const genericBody = `Hi ${clientName},\n\nWe have received your booking request. Our team will review and confirm the details shortly.\n\n— JMS Travels`
        if (channel === 'email') {
          try {
            await sendEmail({ to: clarifyRecipient, subject: 'Booking request received — JMS Travels', body: genericBody, cc: emailCc, replyToThreadId: gmail_thread_id || undefined, inReplyToMessageId: original_message_id || undefined })
          } catch { /* best effort */ }
          await logOutbound(supabase, { bookingId: firstBookingId, clientId: (client as Client)?.id, channel, recipient: clarifyRecipient, body: genericBody, templateKey: TEMPLATE_KEYS.BOOKING_RECEIVED, status: 'sent' })
        } else if (channel === 'whatsapp') {
          const result = await sendWhatsAppMessage({ to: clarifyRecipient, body: genericBody })
          await logOutbound(supabase, { bookingId: firstBookingId, clientId: (client as Client)?.id, channel, recipient: clarifyRecipient, body: genericBody, templateKey: TEMPLATE_KEYS.BOOKING_RECEIVED, status: result.ok ? 'sent' : `failed: ${result.error}` })
        }
      }
      return NextResponse.json({ ok: true, booking_id: firstBookingId, booking_ids: createdBookings.map(b => b.booking.id) })
    }

    // Send confirmation
    const recipient = channel === 'whatsapp'
      ? ((client as Client)?.primary_phone || sender_phone)
      : (sender_email || (client as Client)?.primary_email)

    if (channel === 'whatsapp' && recipient) {
      if (createdBookings.length === 1) {
        const body = buildWhatsAppConfirmation(clientName, createdBookings[0].booking.booking_ref, createdBookings[0].extracted)
        const result = await sendWhatsAppMessage({ to: recipient, body })
        await logOutbound(supabase, { bookingId: firstBookingId, clientId: (client as Client)?.id, channel, recipient, body, templateKey: TEMPLATE_KEYS.BOOKING_RECEIVED, status: result.ok ? 'sent' : `failed: ${result.error}` })
      } else {
        const lines = [`Hi ${clientName}, your ${createdBookings.length} bookings are confirmed.`, ``]
        createdBookings.forEach(({ booking, extracted }, i) => {
          lines.push(`${i + 1}. Ref: ${booking.booking_ref} — ${formatDate(extracted.pickup_date)} ${extracted.pickup_time ? formatTime(extracted.pickup_time) : ''}`)
        })
        lines.push(``, `Driver details will follow. Thank you! — JMS Travels`)
        const body = lines.join('\n')
        const result = await sendWhatsAppMessage({ to: recipient, body })
        await logOutbound(supabase, { bookingId: firstBookingId, clientId: (client as Client)?.id, channel, recipient, body, templateKey: TEMPLATE_KEYS.BOOKING_RECEIVED, status: result.ok ? 'sent' : `failed: ${result.error}` })
      }
    } else if (channel === 'email' && recipient) {
      if (createdBookings.length === 1) {
        const { data: tmpl } = await supabase.from('message_templates').select('body, subject').eq('template_key', TEMPLATE_KEYS.BOOKING_RECEIVED).single()
        if (tmpl) {
          const { extracted } = createdBookings[0]
          const templateVars = {
            client_name: clientName, name: clientName,
            booking_ref: createdBookings[0].booking.booking_ref,
            reference_number: createdBookings[0].booking.booking_ref,
            guest_name: extracted.guest_name || clientName,
            traveler_name: extracted.guest_name || clientName,
            pickup_date: extracted.pickup_date || '',
            travel_date: extracted.pickup_date || '',
          }
          const body = fillTemplate(tmpl.body, templateVars)
          let status = 'failed'
          try {
            await sendEmail({ to: recipient, subject: fillTemplate(tmpl.subject || '', { booking_ref: createdBookings[0].booking.booking_ref, reference_number: createdBookings[0].booking.booking_ref }), body, cc: emailCc, replyToThreadId: gmail_thread_id || undefined, inReplyToMessageId: original_message_id || undefined })
            status = 'sent'
          } catch (e) { status = `failed: ${String(e)}` }
          await logOutbound(supabase, { bookingId: firstBookingId, clientId: (client as Client)?.id, channel, recipient, body, templateKey: TEMPLATE_KEYS.BOOKING_RECEIVED, status })
        }
      } else {
        // Multi-booking email confirmation
        const body = buildMultiBookingEmailBody(clientName, createdBookings.map(cb => ({ ref: cb.booking.booking_ref, extracted: cb.extracted })))
        let status = 'failed'
        try {
          await sendEmail({ to: recipient, subject: `${createdBookings.length} bookings received - JMS Travels`, body, cc: emailCc })
          status = 'sent'
        } catch (e) { status = `failed: ${String(e)}` }
        await logOutbound(supabase, { bookingId: firstBookingId, clientId: (client as Client)?.id, channel, recipient, body, templateKey: TEMPLATE_KEYS.BOOKING_RECEIVED, status })
      }
    }

    if (isAfterHours()) {
      const afterHoursPhone = (client as Client)?.primary_phone || (channel === 'whatsapp' ? sender_phone : null)
      const afterHoursEmail = channel === 'email'
        ? (sender_email || (client as Client)?.primary_email)
        : (client as Client)?.primary_email
      await sendAfterHoursNotices({
        bookingRef: createdBookings[0].booking.booking_ref,
        clientName,
        phone: afterHoursPhone,
        email: afterHoursEmail,
        emailCc: emailCc,
        replyToThreadId: gmail_thread_id || undefined,
        inReplyToMessageId: original_message_id || undefined,
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, booking_id: firstBookingId, booking_ids: createdBookings.map(b => b.booking.id) })
  } catch (err) {
    console.error('[parse-message] Error:', String(err))
    // Mark raw message as failed so it's visible for manual recovery
    try {
      await supabase.from('raw_messages')
        .update({ ai_classification: 'processing_failed', processed: false })
        .eq('id', raw_message_id)
    } catch { /* best effort */ }
    // Alert operator — include enough info to manually create the booking
    await notifyOperator(
      `🔴 Booking processing failed!\n\nFrom: ${sender_email || sender_phone || 'unknown'}\nChannel: ${channel}\nError: ${String(err).slice(0, 200)}\n\nRaw message ID: ${raw_message_id}\nAction: Check raw_messages table and create booking manually.`
    ).catch(() => {})
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
