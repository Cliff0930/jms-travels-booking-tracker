/**
 * Deletes bookings created before April 1, 2025 (pre-FY 2025-26).
 *
 * ⚠️  ONLY run this AFTER confirming the archive spreadsheets exist in Google Drive.
 *
 * Trigger: GET /api/admin/archive-delete?secret=<CRON_SECRET>&confirm=DELETE_PRE_FY
 *
 * The confirm param is required as a second safety check.
 * Does NOT touch clients, companies, or drivers — only bookings and related logs.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notifyOperator } from '@/lib/utils/notify-operator'

const CUTOFF = '2025-04-01T00:00:00.000Z'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret  = searchParams.get('secret')
  const confirm = searchParams.get('confirm')

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (confirm !== 'DELETE_PRE_FY') {
    return NextResponse.json({
      error: 'Missing confirmation. Add &confirm=DELETE_PRE_FY to the URL to proceed.',
      cutoff: CUTOFF,
      warning: 'This will permanently delete all bookings created before April 1, 2025.',
    }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    // Count first so we know what we're deleting
    const { count: bookingCount } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', CUTOFF)

    if ((bookingCount ?? 0) === 0) {
      return NextResponse.json({ ok: true, message: 'No bookings found before April 2025 — nothing deleted.' })
    }

    // Fetch IDs of bookings to delete (for cascading related records)
    const { data: oldBookings } = await supabase
      .from('bookings')
      .select('id')
      .lt('created_at', CUTOFF)

    const oldIds = (oldBookings || []).map(b => b.id as string)

    // Delete related records first, then bookings
    const chunkSize = 100
    for (let i = 0; i < oldIds.length; i += chunkSize) {
      const chunk = oldIds.slice(i, i + chunkSize)
      await Promise.all([
        supabase.from('booking_status_history').delete().in('booking_id', chunk),
        supabase.from('booking_legs').delete().in('booking_id', chunk),
        supabase.from('message_logs').delete().in('booking_id', chunk),
        supabase.from('raw_messages').delete().in('booking_id', chunk),
        supabase.from('conversation_sessions').delete().in('booking_id', chunk),
      ])
      await supabase.from('bookings').delete().in('id', chunk)
    }

    await notifyOperator(
      [
        `🗑️ Pre-FY archive delete complete`,
        `Deleted: ${bookingCount} bookings (created before Apr 1 2025)`,
        `Related records (logs, legs, sessions) also cleaned up.`,
        `Clients, companies and drivers were NOT deleted.`,
      ].join('\n')
    ).catch(() => {})

    return NextResponse.json({
      ok: true,
      deleted: bookingCount,
      message: `Deleted ${bookingCount} bookings created before April 1, 2025.`,
    })
  } catch (err) {
    console.error('[archive-delete] error:', err)
    await notifyOperator(`🔴 Archive delete FAILED!\n\nError: ${String(err).slice(0, 300)}`).catch(() => {})
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
