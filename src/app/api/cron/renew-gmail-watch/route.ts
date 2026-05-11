import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/server'
import { notifyOperator } from '@/lib/utils/notify-operator'

function getOAuthClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  )
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  return oauth2
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

  // ── 1. Renew Gmail watch ──────────────────────────────────────────────────
  let renewalOk = false
  let renewalHistoryId: string | null = null
  try {
    const auth = getOAuthClient()
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
      { data: failedMessages },
    ] = await Promise.all([
      supabase.from('bookings').select('id', { count: 'exact', head: true }).gte('created_at', yesterday),
      supabase.from('bookings').select('booking_ref, pickup_date, guest_name').eq('status', 'pending_approval').order('created_at').limit(5),
      supabase.from('bookings').select('booking_ref, pickup_date, pickup_time, guest_name').eq('status', 'confirmed').is('driver_id', null).in('pickup_date', [today, tomorrow]).order('pickup_date').limit(10),
      supabase.from('raw_messages').select('id', { count: 'exact', head: true }).eq('ai_classification', 'processing_failed').eq('processed', false),
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

    if ((failedMessages as unknown as { count: number } | null)?.count ?? 0 > 0) {
      lines.push(`\n🔴 Failed messages needing manual review: ${(failedMessages as unknown as { count: number }).count}`)
      lines.push(`   Check raw_messages where ai_classification = 'processing_failed'`)
    }

    if (!renewalOk) lines.push(`\n⚠️ Gmail watch renewal FAILED — see earlier alert.`)

    await notifyOperator(lines.join('\n'))
  } catch (err) {
    console.error('[gmail-watch] Morning digest failed:', err)
  }

  return NextResponse.json({ ok: true, renewal: renewalOk, historyId: renewalHistoryId })
}
