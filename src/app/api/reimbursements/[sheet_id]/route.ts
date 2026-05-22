import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const ALLOWED_FLAGS = [
  'tripsheet_doc_received',
  'toll_received', 'parking_received', 'permit_received', 'bata_received',
  'toll_paid', 'parking_paid', 'permit_paid', 'bata_paid',
  'reimbursement_notes',
]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sheet_id: string }> }
) {
  const { sheet_id } = await params
  const supabase = createAdminClient()
  const body = await request.json() as Record<string, unknown>

  // Only allow safe fields
  const update: Record<string, unknown> = {}
  for (const key of ALLOWED_FLAGS) {
    if (key in body) update[key] = body[key]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  // Fetch current sheet state to determine if now fully settled
  const { data: current, error: fetchErr } = await supabase
    .from('trip_sheets')
    .select('toll_amount, parking_amount, permit_amount, bata_driver, tripsheet_doc_received, toll_received, parking_received, permit_received, bata_received, toll_paid, parking_paid, permit_paid, bata_paid, reimbursed_at')
    .eq('id', sheet_id)
    .single()
  if (fetchErr || !current) return NextResponse.json({ error: 'Sheet not found' }, { status: 404 })

  // Merge with incoming update
  const merged = { ...current, ...update }

  // Check if fully settled
  const toll = (merged.toll_amount as number | null) ?? 0
  const parking = (merged.parking_amount as number | null) ?? 0
  const permit = (merged.permit_amount as number | null) ?? 0
  const bata = (merged.bata_driver as number | null) ?? 0

  const fullySettled =
    merged.tripsheet_doc_received &&
    (toll <= 0 || (merged.toll_received && merged.toll_paid)) &&
    (parking <= 0 || (merged.parking_received && merged.parking_paid)) &&
    (permit <= 0 || (merged.permit_received && merged.permit_paid)) &&
    (bata <= 0 || (merged.bata_received && merged.bata_paid))

  if (fullySettled && !current.reimbursed_at) {
    update.reimbursed_at = new Date().toISOString()
  } else if (!fullySettled && current.reimbursed_at) {
    update.reimbursed_at = null
  }

  const { data, error } = await supabase
    .from('trip_sheets')
    .update(update)
    .eq('id', sheet_id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
