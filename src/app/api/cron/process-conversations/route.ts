import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { processConversationSession } from '@/lib/conversation/process'

// Safety-net cron — catches sessions not processed inline by the webhook.
// Primary processing now happens immediately in the webhook via after().
const SILENCE_WINDOW_MS = 5_000   // 5 seconds — give webhook time to process first
const STALE_RETRY_MS    = 3 * 60_000

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createAdminClient()
  const now = Date.now()
  const cutoff = new Date(now - SILENCE_WINDOW_MS).toISOString()
  const staleCutoff = new Date(now - STALE_RETRY_MS).toISOString()

  const { data: pendingSessions } = await supabase
    .from('conversation_sessions')
    .select('*')
    .eq('status', 'collecting')
    .eq('pending_process', true)
    .lte('last_message_at', cutoff)
    .order('last_message_at', { ascending: true })
    .limit(20)

  // Rescue sessions stuck in pending_process=false for 3+ minutes
  await supabase
    .from('conversation_sessions')
    .update({ pending_process: true })
    .eq('status', 'collecting')
    .eq('pending_process', false)
    .lte('updated_at', staleCutoff)

  if (!pendingSessions?.length) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  let processed = 0
  for (const session of pendingSessions) {
    try {
      await processConversationSession(supabase, session)
      processed++
    } catch (err) {
      console.error(`[cron] Error processing session ${session.id}:`, String(err))
      await supabase
        .from('conversation_sessions')
        .update({ pending_process: true })
        .eq('id', session.id)
        .eq('status', 'collecting')
    }
  }

  return NextResponse.json({ ok: true, processed })
}
