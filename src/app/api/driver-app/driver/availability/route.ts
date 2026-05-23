import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractDriverToken } from '@/lib/utils/driver-app-auth'

export async function GET(request: Request) {
  const verified = extractDriverToken(request)
  if (!verified) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('drivers')
    .select('is_available')
    .eq('id', verified.driverId)
    .maybeSingle()

  return NextResponse.json({ available: data?.is_available ?? true })
}

export async function POST(request: Request) {
  const verified = extractDriverToken(request)
  if (!verified) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { available: boolean }
  if (typeof body.available !== 'boolean') {
    return NextResponse.json({ error: 'available must be boolean' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('drivers')
    .update({ is_available: body.available })
    .eq('id', verified.driverId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, available: body.available })
}
