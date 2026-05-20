import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/server'
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

function getISTDates() {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const today = ist.toISOString().slice(0, 10)
  const tomorrow = new Date(ist.getTime() + 86400000).toISOString().slice(0, 10)
  return { today, tomorrow }
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

  const supabase = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://booking.jmstravels.net'
  const { today, tomorrow } = getISTDates()

  // ── 0. Re-subscribe WABA app (prevents Meta circuit-breaker blocking delivery) ──
  let wabaSubOk = false
  try {
    const wabaId = process.env.WHATSAPP_WABA_ID
    const systemToken = process.env.WHATSAPP_SYSTEM_TOKEN
    if (wabaId && systemToken) {
      const res = await fetch(`https://graph.facebook.com/v25.0/${wabaId}/subscribed_apps`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${systemToken}` },
      })
      const json = await res.json() as { success?: boolean; error?: { message: string } }
      if (json.success) {
        wabaSubOk = true
        console.log('[cron] WABA resubscription OK')
      } else {
        throw new Error(json.error?.message ?? JSON.stringify(json))
      }
    } else {
      wabaSubOk = true // env not configured — skip silently
    }
  } catch (err) {
    console.error('[cron] WABA resubscription FAILED:', err)
    await notifyOperator(
      `🔴 WhatsApp webhook re-subscription FAILED!\n\nMessages may stop arriving from clients.\n\nError: ${String(err).slice(0, 200)}\n\nCheck WHATSAPP_SYSTEM_TOKEN and WHATSAPP_WABA_ID in Vercel env.`
    ).catch(() => {})
  }

  // ── 1. Renew Gmail watch ──────────────────────────────────────────────────
  let renewalOk = false
  let renewalHistoryId: string | null = null
  try {
    const auth = getGmailAuth()
    const gmail = google.gmail({ version: 'v1', auth })
    const { data } = await gmail.users.watch({
      userId: 'me',
      requestBody: { topicName: process.env.GOOGLE_PUBSUB_TOPIC!, labelIds: ['INBOX'] },
    })
    const expiresAt = data.expiration ? new Date(parseInt(data.expiration)).toISOString() : null
    renewalHistoryId = data.historyId ? String(data.historyId) : null
    if (renewalHistoryId) {
      await supabase.from('app_settings').upsert({
        key: 'gmail_last_history_id',
        value: renewalHistoryId,
        updated_at: new Date().toISOString(),
      })
    }
    renewalOk = true
    console.log('[gmail-watch] Renewed. Expires:', expiresAt, '| historyId:', renewalHistoryId)
  } catch (err) {
    console.error('[gmail-watch] Renewal failed:', err)
    await notifyOperator(
      `🔴 Gmail watch renewal FAILED!\n\nEmails will stop arriving within 7 days if not fixed.\n\nError: ${String(err).slice(0, 200)}\n\nAction: Check GMAIL_REFRESH_TOKEN in Vercel env vars and re-run the renewal manually.`
    ).catch(() => {})
  }

  // ── 2. Auto-chase overdue pending approvals ───────────────────────────────
  try {
    const { data: pendingBookings } = await supabase
      .from('bookings')
      .select('id, booking_ref, updated_at, company:companies(approval_timeout_hours)')
      .eq('status', 'pending_approval')
      .order('updated_at', { ascending: true })
      .limit(20)

    let chased = 0
    for (const booking of pendingBookings ?? []) {
      const company = booking.company as { approval_timeout_hours?: number } | null
      const timeoutHours = company?.approval_timeout_hours ?? 4
      const updatedAt = new Date(booking.updated_at as string)
      const hoursPending = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60)
      if (hoursPending < timeoutHours) continue

      try {
        await fetch(`${appUrl}/api/bookings/${booking.id}/chase-approval`, { method: 'POST' })
        chased++
      } catch { /* non-critical per booking */ }
    }

    if (chased > 0) console.log(`[gmail-watch] Auto-chased ${chased} pending approval(s)`)
  } catch (err) {
    console.error('[gmail-watch] Auto-chase failed:', err)
  }

  // ── 3. Morning digest to operator ─────────────────────────────────────────
  try {
    const yesterday = new Date(Date.now() - 86400000).toISOString()

    const [
      { count: newCount },
      { data: pendingApprovals },
      { data: unassignedToday },
      { count: failedCount },
      { count: recentMsgCount },
    ] = await Promise.all([
      supabase.from('bookings').select('id', { count: 'exact', head: true }).gte('created_at', yesterday),
      supabase.from('bookings').select('booking_ref, pickup_date, guest_name').eq('status', 'pending_approval').order('created_at').limit(5),
      supabase.from('bookings').select('booking_ref, pickup_date, pickup_time, guest_name').eq('status', 'confirmed').is('driver_id', null).in('pickup_date', [today, tomorrow]).order('pickup_date').limit(10),
      supabase.from('raw_messages').select('id', { count: 'exact', head: true }).eq('ai_classification', 'processing_failed').eq('processed', false),
      supabase.from('raw_messages').select('id', { count: 'exact', head: true }).gte('received_at', yesterday),
    ])

    const lines: string[] = [`☀️ Good morning — CabFlow Daily Summary`]
    lines.push(`\n📅 ${today}`)
    lines.push(`New bookings (24h): ${newCount ?? 0}`)

    if ((pendingApprovals?.length ?? 0) > 0) {
      lines.push(`\n⏳ Pending approval (${pendingApprovals!.length}):`)
      for (const b of pendingApprovals!) {
        lines.push(`  • ${b.booking_ref}${b.guest_name ? ` — ${b.guest_name}` : ''}${b.pickup_date ? ` (${b.pickup_date})` : ''}`)
      }
    }

    if ((unassignedToday?.length ?? 0) > 0) {
      lines.push(`\n🚗 Confirmed — no driver yet (${unassignedToday!.length}):`)
      for (const b of unassignedToday!) {
        const when = b.pickup_date === today ? 'Today' : 'Tomorrow'
        lines.push(`  • ${b.booking_ref} ${when}${b.pickup_time ? ` ${b.pickup_time}` : ''}${b.guest_name ? ` — ${b.guest_name}` : ''}`)
      }
    }

    if ((failedCount ?? 0) > 0) {
      lines.push(`\n🔴 Failed messages needing manual review: ${failedCount}`)
      lines.push(`   Check raw_messages where ai_classification = 'processing_failed'`)
    }

    if ((recentMsgCount ?? 0) === 0) lines.push(`\n🚨 No messages received in 24h — WhatsApp/Gmail webhooks may be broken!`)
    if (!wabaSubOk) lines.push(`\n🔴 WhatsApp re-subscription FAILED — webhook delivery may be broken!`)
    if (!renewalOk) lines.push(`\n⚠️ Gmail watch renewal FAILED — see earlier alert.`)

    await notifyOperator(lines.join('\n'), 'ops')
  } catch (err) {
    console.error('[gmail-watch] Morning digest failed:', err)
  }

  return NextResponse.json({ ok: true, renewal: renewalOk, historyId: renewalHistoryId })
}
