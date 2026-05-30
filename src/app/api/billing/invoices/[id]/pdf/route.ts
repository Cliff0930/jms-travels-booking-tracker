import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { createAdminClient } from '@/lib/supabase/server'
import { InvoicePDF } from '@/components/billing/InvoicePDF'
import type { InvoicePDFData } from '@/components/billing/InvoicePDF'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: invoice, error }, { data: lineItems }] = await Promise.all([
    supabase
      .from('invoices')
      .select('*, company:companies!company_id(name, gstin, address)')
      .eq('id', id)
      .single(),
    supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', id)
      .order('sort_order', { ascending: true }),
  ])

  if (error || !invoice) {
    return new Response('Invoice not found', { status: 404 })
  }

  const data: InvoicePDFData = {
    invoice_number: invoice.invoice_number,
    period_from: invoice.period_from,
    period_to: invoice.period_to,
    created_at: invoice.created_at,
    reverse_charge: invoice.reverse_charge ?? false,
    company: invoice.company ?? { name: 'Unknown' },
    subtotal: Number(invoice.subtotal),
    cgst_amount: Number(invoice.cgst_amount),
    sgst_amount: Number(invoice.sgst_amount),
    igst_amount: Number(invoice.igst_amount),
    tds_amount: Number(invoice.tds_amount),
    grand_total: Number(invoice.grand_total),
    line_items: (lineItems ?? []).map(li => ({
      booking_ref: li.booking_ref ?? '',
      trip_date: li.trip_date,
      vehicle_number: li.vehicle_number,
      vehicle_type: li.vehicle_type,
      actual_kms: Number(li.actual_kms ?? 0),
      actual_hrs: Number(li.actual_hrs ?? 0),
      package_type: li.package_type ?? '8HR',
      package_kms: Number(li.package_kms ?? 80),
      package_rate: Number(li.package_rate ?? 0),
      extra_hrs: Number(li.extra_hrs ?? 0),
      extra_hr_rate: Number(li.extra_hr_rate ?? 0),
      extra_hr_amount: Number(li.extra_hr_amount ?? 0),
      extra_kms: Number(li.extra_kms ?? 0),
      extra_km_rate: Number(li.extra_km_rate ?? 0),
      extra_km_amount: Number(li.extra_km_amount ?? 0),
      hire_charges: Number(li.hire_charges ?? 0),
      toll_amount: Number(li.toll_amount ?? 0),
      parking_amount: Number(li.parking_amount ?? 0),
      permit_amount: Number(li.permit_amount ?? 0),
      bata_amount: Number(li.bata_amount ?? 0),
      bill_bata: li.bill_bata ?? false,
      cgst_amount: Number(li.cgst_amount ?? 0),
      sgst_amount: Number(li.sgst_amount ?? 0),
      igst_amount: Number(li.igst_amount ?? 0),
      line_total: Number(li.line_total ?? 0),
    })),
  }

  const buffer = await renderToBuffer(createElement(InvoicePDF, { data }))

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoice_number}.pdf"`,
    },
  })
}
