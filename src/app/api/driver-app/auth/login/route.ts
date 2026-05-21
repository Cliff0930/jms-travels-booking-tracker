import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hashPin, createDriverAppToken } from '@/lib/utils/driver-app-auth'

export async function POST(request: Request) {
  const { phone, pin } = await request.json() as { phone?: string; pin?: string }
  if (!phone || !pin) return NextResponse.json({ error: 'Phone and PIN required' }, { status: 400 })

  const supabase = createAdminClient()
  const raw = phone.trim().replace(/\D/g, '')
  // Try bare number, then with 91 prefix, then with +91 prefix
  const candidates = [...new Set([raw, `91${raw}`, `+91${raw}`, raw.replace(/^91/, ''), raw.replace(/^\+91/, '')])]

  let driver: { id: string; name: string; phone: string; pin_hash: string | null } | null = null
  for (const candidate of candidates) {
    const { data } = await supabase
      .from('drivers')
      .select('id, name, phone, pin_hash')
      .eq('phone', candidate)
      .maybeSingle()
    if (data) { driver = data; break }
  }

  if (!driver?.pin_hash) {
    return NextResponse.json({ error: 'Invalid phone or PIN' }, { status: 401 })
  }

  // Hash must match — use the stored phone (canonical form) for verification
  const expectedHash = hashPin(driver.phone, pin.trim())
  if (driver.pin_hash !== expectedHash) {
    return NextResponse.json({ error: 'Invalid phone or PIN' }, { status: 401 })
  }

  const token = createDriverAppToken(driver.id)
  return NextResponse.json({
    token,
    driver: { id: driver.id, name: driver.name, phone: driver.phone },
  })
}
