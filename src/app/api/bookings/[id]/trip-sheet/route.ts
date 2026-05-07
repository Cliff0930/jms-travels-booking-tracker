import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('trip_sheets')
    .select('*')
    .eq('booking_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return NextResponse.json(data || null)
}
