import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('company_driver_rates')
    .select('*, company:companies!company_id(name)')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const body = await request.json()
  const { data, error } = await supabase
    .from('company_driver_rates')
    .upsert(
      {
        company_id:              body.company_id,
        vehicle_type:            body.vehicle_type,
        rate_4hr:                body.rate_4hr       ?? null,
        rate_airport:            body.rate_airport   ?? null,
        rate_8hr:                body.rate_8hr       ?? null,
        extra_km_rate:           body.extra_km_rate  ?? null,
        extra_hr_rate:           body.extra_hr_rate  ?? null,
        outstation_rate_per_km:  body.outstation_rate_per_km  ?? null,
        bata_per_day:            body.bata_per_day            ?? null,
        outstation_bata_per_day: body.outstation_bata_per_day ?? null,
        is_active:               true,
      },
      { onConflict: 'company_id,vehicle_type' }
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
