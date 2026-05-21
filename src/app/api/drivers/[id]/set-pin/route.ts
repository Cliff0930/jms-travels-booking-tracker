import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hashPin } from '@/lib/utils/driver-app-auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { pin } = await request.json() as { pin?: string }

  if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be 4–6 digits' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: driver } = await supabase
    .from('drivers')
    .select('id, phone')
    .eq('id', id)
    .maybeSingle()

  if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })

  const pin_hash = hashPin(driver.phone, pin)
  await supabase.from('drivers').update({ pin_hash }).eq('id', id)

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()
  await supabase.from('drivers').update({ pin_hash: null }).eq('id', id)
  return NextResponse.json({ ok: true })
}
