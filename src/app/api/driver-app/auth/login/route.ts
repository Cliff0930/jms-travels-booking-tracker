import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hashPin, createDriverAppToken } from '@/lib/utils/driver-app-auth'

export async function POST(request: Request) {
  const { phone, pin } = await request.json() as { phone?: string; pin?: string }
  if (!phone || !pin) return NextResponse.json({ error: 'Phone and PIN required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: driver } = await supabase
    .from('drivers')
    .select('id, name, phone, pin_hash')
    .eq('phone', phone.trim())
    .maybeSingle()

  if (!driver?.pin_hash) {
    return NextResponse.json({ error: 'Invalid phone or PIN' }, { status: 401 })
  }

  const expectedHash = hashPin(phone.trim(), pin.trim())
  if (driver.pin_hash !== expectedHash) {
    return NextResponse.json({ error: 'Invalid phone or PIN' }, { status: 401 })
  }

  const token = createDriverAppToken(driver.id)
  return NextResponse.json({
    token,
    driver: { id: driver.id, name: driver.name, phone: driver.phone },
  })
}
