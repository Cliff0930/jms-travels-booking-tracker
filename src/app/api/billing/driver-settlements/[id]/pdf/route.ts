import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createAdminClient } from '@/lib/supabase/server'
import { DriverSettlementPDF } from '@/components/billing/DriverSettlementPDF'
import type { DriverSettlementPDFData } from '@/components/billing/DriverSettlementPDF'

function getLogoDataUri(): string | undefined {
  const logoPath = join(process.cwd(), 'public', 'jms-logo.png')
  if (!existsSync(logoPath)) return undefined
  return `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: settlement, error }, { data: trips }] = await Promise.all([
    supabase
      .from('driver_settlements')
      .select('*, driver:drivers!driver_id(id, name, vehicle_name, vehicle_number)')
      .eq('id', id)
      .single(),
    supabase
      .from('driver_settlement_trips')
      .select('*')
      .eq('settlement_id', id)
      .order('trip_date', { ascending: true }),
  ])

  if (error || !settlement) return new Response('Statement not found', { status: 404 })

  const { data: rateSetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'advance_interest_rate_pct')
    .maybeSingle()
  const interestRatePct = parseFloat(rateSetting?.value ?? '2')

  const driver = settlement.driver as { name: string; vehicle_name: string; vehicle_number: string } | null

  const data: DriverSettlementPDFData = {
    logoSrc: getLogoDataUri(),
    driver_name: driver?.name ?? 'Unknown',
    vehicle_name: driver?.vehicle_name ?? '',
    vehicle_number: driver?.vehicle_number ?? '',
    period_from: settlement.period_from,
    period_to: settlement.period_to,
    trips: (trips ?? []).map(t => ({
      trip_date: t.trip_date ?? '',
      booking_ref: t.booking_ref ?? '',
      tripsheet_number: t.tripsheet_number ?? null,
      company_name: t.company_name ?? '',
      actual_kms: Number(t.actual_kms ?? 0),
      actual_hrs: Number(t.actual_hrs ?? 0),
      client_hire_charges: Number(t.client_hire_charges ?? 0),
      commission_percent: Number(t.commission_percent ?? 0),
      hire_earnings: Number(t.hire_earnings ?? 0),
      bata_count: Number(t.bata_count ?? 0),
      bata_earnings: Number(t.bata_earnings ?? 0),
      toll_amount: Number(t.toll_amount ?? 0),
      parking_amount: Number(t.parking_amount ?? 0),
      permit_amount: Number(t.permit_amount ?? 0),
      trip_total: Number(t.trip_total ?? 0),
    })),
    hire_earnings: Number(settlement.hire_earnings ?? 0),
    bata_earnings: Number(settlement.bata_earnings ?? 0),
    reimbursements: Number(settlement.reimbursements ?? 0),
    salary_amount: Number(settlement.salary_amount ?? 0),
    gross_earnings: Number(settlement.gross_earnings ?? 0),
    advance_outstanding: Number(settlement.advance_principal_deduction ?? 0) + Number(settlement.advance_interest_deduction ?? 0),
    advance_principal_deduction: Number(settlement.advance_principal_deduction ?? 0),
    advance_interest_deduction: Number(settlement.advance_interest_deduction ?? 0),
    interest_rate_pct: interestRatePct,
    other_deductions: Number(settlement.other_deductions ?? 0),
    net_payable: Number(settlement.net_payable ?? 0),
    payment_mode: settlement.payment_mode,
    payment_reference: settlement.payment_reference,
    paid_at: settlement.paid_at,
    status: settlement.status,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(createElement(DriverSettlementPDF, { data }) as any)
  const driverSlug = (driver?.name ?? 'driver').replace(/\s+/g, '-').toLowerCase()
  const filename = `driver-statement-${driverSlug}-${settlement.period_from}.pdf`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
