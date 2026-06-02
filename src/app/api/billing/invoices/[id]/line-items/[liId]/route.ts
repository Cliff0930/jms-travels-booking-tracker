import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; liId: string }> }
) {
  const { id: invoiceId, liId } = await params
  const { reviewed } = await req.json() as { reviewed: boolean }
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('invoice_line_items')
    .update({ reviewed: !!reviewed })
    .eq('id', liId)
    .eq('invoice_id', invoiceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
