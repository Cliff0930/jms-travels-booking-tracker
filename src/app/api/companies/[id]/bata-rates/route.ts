import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('company_bata_rates')
    .select('id, vehicle_name, rate_per_bata')
    .eq('company_id', id)
    .order('vehicle_name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { vehicle_name, rate_per_bata } = await request.json() as { vehicle_name: string; rate_per_bata: number }
  if (!vehicle_name?.trim() || !rate_per_bata) return NextResponse.json({ error: 'vehicle_name and rate_per_bata required' }, { status: 400 })
  const { data, error } = await supabase
    .from('company_bata_rates')
    .upsert({ company_id: id, vehicle_name: vehicle_name.trim(), rate_per_bata: Number(rate_per_bata) }, { onConflict: 'company_id,vehicle_name' })
    .select('id, vehicle_name, rate_per_bata')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = await params
  const { searchParams } = new URL(request.url)
  const rateId = searchParams.get('rate_id')
  if (!rateId) return NextResponse.json({ error: 'rate_id required' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('company_bata_rates').delete().eq('id', rateId).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
