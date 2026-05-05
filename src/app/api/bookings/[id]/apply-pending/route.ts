import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const PENDING_SUFFIX = ' (requested, not yet applied)'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { log_id, action } = await request.json() as { log_id: string; action: 'apply' | 'dismiss' }
  const supabase = createAdminClient()

  const { data: log } = await supabase
    .from('booking_edit_logs')
    .select('*')
    .eq('id', log_id)
    .eq('booking_id', id)
    .single()

  if (!log) return NextResponse.json({ error: 'Log not found' }, { status: 404 })
  if (!log.changed_by.includes('[PENDING]')) return NextResponse.json({ error: 'Not a pending change' }, { status: 400 })

  if (action === 'apply') {
    const change = (log.changes as Array<{ field: string; label: string; old_value: string; new_value: string }>)[0]
    if (change) {
      const rawValue = change.new_value.endsWith(PENDING_SUFFIX)
        ? change.new_value.slice(0, -PENDING_SUFFIX.length)
        : change.new_value

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (change.field === 'pax_count') {
        updateData.pax_count = parseInt(rawValue) || null
      } else {
        updateData[change.field] = rawValue
      }

      await supabase.from('bookings').update(updateData).eq('id', id)
    }

    await supabase
      .from('booking_edit_logs')
      .update({ changed_by: log.changed_by.replace('[PENDING]', '[APPLIED]') })
      .eq('id', log_id)
  } else {
    await supabase
      .from('booking_edit_logs')
      .update({ changed_by: log.changed_by.replace('[PENDING]', '[DISMISSED]') })
      .eq('id', log_id)
  }

  return NextResponse.json({ ok: true })
}
