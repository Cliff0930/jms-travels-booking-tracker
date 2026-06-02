/* eslint-disable @typescript-eslint/no-explicit-any */
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createAdminClient } from '@/lib/supabase/server'
import { CashReceiptPDF } from '@/components/billing/CashReceiptPDF'
import type { CashReceiptPDFData } from '@/components/billing/CashReceiptPDF'

function getLogoDataUri(): string | undefined {
  const logoPath = join(process.cwd(), 'public', 'jms-logo.png')
  if (!existsSync(logoPath)) return undefined
  return `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: bill, error }, { data: lineItems }] = await Promise.all([
    supabase.from('cash_bills')
      .select('*, client:clients!client_id(name, prefix, designation, primary_phone)')
      .eq('id', id).single(),
    supabase.from('cash_bill_line_items').select('*').eq('cash_bill_id', id).order('sort_order', { ascending: true }),
  ])

  if (error || !bill) return new Response('Not found', { status: 404 })

  // Fetch tripsheet numbers
  const sheetIds = (lineItems ?? []).map((li: any) => li.trip_sheet_id).filter(Boolean) as string[]
  const tripsheetMap: Record<string, string | null> = {}
  if (sheetIds.length > 0) {
    const { data: sheets } = await supabase.from('trip_sheets').select('id, tripsheet_number').in('id', sheetIds)
    for (const s of sheets ?? []) tripsheetMap[s.id] = s.tripsheet_number ?? null
  }

  const data: CashReceiptPDFData = {
    logoSrc: getLogoDataUri(),
    bill_number: bill.bill_number,
    period_from: bill.period_from,
    period_to: bill.period_to,
    created_at: bill.created_at,
    client_name: bill.client_name,
    client_phone: (bill.client as any)?.primary_phone ?? null,
    payment_mode: bill.payment_mode,
    status: bill.status,
    subtotal: Number(bill.subtotal),
    total: Number(bill.total),
    notes: bill.notes,
    line_items: (lineItems ?? []).map((li: any) => ({
      booking_ref: li.booking_ref ?? '',
      tripsheet_number: li.trip_sheet_id ? (tripsheetMap[li.trip_sheet_id] ?? null) : null,
      trip_date: li.trip_date,
      vehicle_number: li.vehicle_number,
      vehicle_type: li.vehicle_type,
      trip_type: li.trip_type ?? null,
      actual_kms: Number(li.actual_kms ?? 0),
      actual_hrs: Number(li.actual_hrs ?? 0),
      package_type: li.package_type ?? '',
      package_kms: Number(li.package_kms ?? 0),
      package_rate: Number(li.package_rate ?? 0),
      extra_kms: Number(li.extra_kms ?? 0),
      extra_km_rate: Number(li.extra_km_rate ?? 0),
      extra_km_amount: Number(li.extra_km_amount ?? 0),
      extra_hrs: Number(li.extra_hrs ?? 0),
      extra_hr_rate: Number(li.extra_hr_rate ?? 0),
      extra_hr_amount: Number(li.extra_hr_amount ?? 0),
      hire_charges: Number(li.hire_charges ?? 0),
      toll_amount: Number(li.toll_amount ?? 0),
      parking_amount: Number(li.parking_amount ?? 0),
      permit_amount: Number(li.permit_amount ?? 0),
      bata_amount: Number(li.bata_amount ?? 0),
      line_total: Number(li.line_total ?? 0),
      pickup_location: li.pickup_location ?? null,
      drop_location: li.drop_location ?? null,
    })),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(createElement(CashReceiptPDF, { data }) as any)
  const billRef = bill.bill_number ?? `CASH-DRAFT-${id.slice(0, 8)}`

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${billRef}.pdf"`,
    },
  })
}
