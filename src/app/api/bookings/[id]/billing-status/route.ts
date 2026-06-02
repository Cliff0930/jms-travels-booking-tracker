import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [invoiceRes, cashBillRes, settlementRes] = await Promise.all([
    // Check GST invoice
    supabase.from('invoice_line_items')
      .select('invoice_id, invoice:invoices!invoice_id(invoice_number, status)')
      .eq('booking_id', id)
      .not('invoice.status', 'eq', 'cancelled')
      .maybeSingle(),
    // Check cash bill
    supabase.from('cash_bill_line_items')
      .select('cash_bill_id, cash_bill:cash_bills!cash_bill_id(bill_number, status)')
      .eq('booking_id', id)
      .not('cash_bill.status', 'eq', 'cancelled')
      .maybeSingle(),
    // Check driver settlement
    supabase.from('driver_settlement_trips')
      .select('id, settlement_id')
      .eq('booking_id', id)
      .maybeSingle(),
  ])

  const inv = invoiceRes.data
  const cb  = cashBillRes.data
  const dst = settlementRes.data

  return NextResponse.json({
    invoice_id:     inv?.invoice_id ?? null,
    invoice_number: (inv?.invoice as { invoice_number?: string | null } | null)?.invoice_number ?? null,
    invoice_status: (inv?.invoice as { status?: string } | null)?.status ?? null,
    cash_bill_id:     cb?.cash_bill_id ?? null,
    cash_bill_number: (cb?.cash_bill as { bill_number?: string | null } | null)?.bill_number ?? null,
    cash_bill_status: (cb?.cash_bill as { status?: string } | null)?.status ?? null,
    settlement_ref: dst?.settlement_id ?? null,
    settled: !!dst,
  })
}
