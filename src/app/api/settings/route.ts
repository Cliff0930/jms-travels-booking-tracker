import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const ALLOWED_KEYS = ['office_location', 'distance_calculation_enabled', 'email_signature']

export async function GET() {
  const supabase = createAdminClient()
  const { data } = await supabase.from('app_settings').select('key, value').in('key', ALLOWED_KEYS)
  const map: Record<string, string> = {}
  data?.forEach(row => { map[row.key] = row.value })
  return NextResponse.json(map)
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, string>
  const supabase = createAdminClient()
  const entries = Object.entries(body)
    .filter(([key]) => ALLOWED_KEYS.includes(key))
    .map(([key, value]) => ({ key, value }))
  if (entries.length === 0) return NextResponse.json({ ok: true })
  await supabase.from('app_settings').upsert(entries, { onConflict: 'key' })
  return NextResponse.json({ ok: true })
}
