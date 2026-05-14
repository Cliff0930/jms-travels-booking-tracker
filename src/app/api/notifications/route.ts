import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('operator_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  return NextResponse.json(data ?? [])
}

export async function POST() {
  const supabase = createAdminClient()
  await supabase
    .from('operator_notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
  return NextResponse.json({ ok: true })
}
