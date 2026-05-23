import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractDriverToken } from '@/lib/utils/driver-app-auth'

export async function GET(request: Request) {
  const verified = extractDriverToken(request)
  if (!verified) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('drivers')
    .select('vehicle_name, vehicle_number, vehicle_type, vehicle_color')
    .eq('id', verified.driverId)
    .maybeSingle()

  return NextResponse.json(data ?? {})
}
