import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

const NAVY  = '#1e3a5f'
const TEAL  = '#00897B'
const BORDER = '#D0D5DD'
const ALT   = '#F4F7FC'
const TEXT  = '#1a1a1a'

const JMS = {
  name: 'J M S TRAVELS',
  tagline: 'we take pride in your ride',
  address: '#14/17, 15th Cross, Eshwar Layout, Indira Nagar, Bangalore-560038',
  phone: '+91 98455 72207 / 809540 3101',
}

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 7, color: TEXT, paddingBottom: 20 },
  tealStripe: { height: 4, backgroundColor: TEAL },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#FAFBFF' },
  logoImg: { width: 60, height: 60, objectFit: 'contain' },
  logoBox: { width: 60, height: 60 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  companyName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: 2 },
  taglineText: { fontSize: 6, fontFamily: 'Helvetica-Oblique', color: '#777', marginTop: 1 },
  addrLine: { fontSize: 6.5, color: '#555', marginTop: 2, textAlign: 'center' },
  titleBadge: { width: 90, backgroundColor: NAVY, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center', borderRadius: 3 },
  titleBadgeText: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#fff', textAlign: 'center' },
  navyStripe: { height: 1.5, backgroundColor: NAVY },
  pad: { paddingHorizontal: 20 },

  driverInfoRow: { flexDirection: 'row', gap: 0, marginTop: 8, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: TEAL, paddingLeft: 8, paddingVertical: 4 },
  driverName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY },
  driverSub: { fontSize: 7, color: '#555', marginTop: 2 },

  tableHeader: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 5, paddingHorizontal: 4 },
  tableHeaderCell: { fontFamily: 'Helvetica-Bold', color: '#fff', fontSize: 6 },
  tableRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  tableRowAlt: { backgroundColor: ALT },
  cell: { fontSize: 6.5, color: TEXT },

  summaryBox: { marginTop: 16, marginHorizontal: 20, flexDirection: 'row', justifyContent: 'flex-end' },
  summaryInner: { width: 220, borderWidth: 1, borderColor: BORDER, borderRadius: 3 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  summaryLabel: { fontSize: 7, color: '#555' },
  summaryValue: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: TEXT },
  summaryTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: NAVY, borderRadius: 2 },
  summaryTotalLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' },
  summaryTotalValue: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' },

  footer: { position: 'absolute', bottom: 10, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: BORDER, paddingTop: 4 },
  footerText: { fontSize: 6, color: '#999' },
})

function rupees(n: number | null | undefined) {
  if (n == null) return '₹0.00'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export interface TripLine {
  trip_date: string; booking_ref: string; company_name: string
  actual_kms: number; actual_hrs: number
  client_hire_charges: number; commission_percent: number; hire_earnings: number
  bata_count: number; bata_earnings: number
  toll_amount: number; parking_amount: number; permit_amount: number; trip_total: number
}

export interface DriverSettlementPDFData {
  logoSrc?: string
  driver_name: string
  vehicle_name: string
  vehicle_number: string
  period_from: string
  period_to: string
  trips: TripLine[]
  hire_earnings: number
  bata_earnings: number
  reimbursements: number
  salary_amount: number
  gross_earnings: number
  advance_outstanding: number
  advance_principal_deduction: number
  advance_interest_deduction: number
  interest_rate_pct?: number
  other_deductions: number
  net_payable: number
  payment_mode?: string | null
  payment_reference?: string | null
  paid_at?: string | null
  status: string
}

// Column widths for portrait A4 (595pt), 20pt margins = 555pt usable
const C = { no: 18, date: 46, ref: 46, company: 80, kms: 28, hire: 46, comm: 28, share: 46, bata: 36, reimb: 36, total: 45 }
// Sum = 459, fine for portrait

const MODE_LABELS: Record<string, string> = { cash: 'Cash', bank_transfer: 'Bank Transfer', upi: 'UPI', cheque: 'Cheque', neft: 'NEFT', rtgs: 'RTGS' }

export function DriverSettlementPDF({ data }: { data: DriverSettlementPDFData }) {
  const commPct = data.trips[0]?.commission_percent ?? 0

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.tealStripe} />

        {/* Header */}
        <View style={s.headerRow}>
          {data.logoSrc ? (
            <Image src={data.logoSrc} style={s.logoImg} />
          ) : (
            <View style={s.logoBox} />
          )}
          <View style={s.headerCenter}>
            <Text style={s.companyName}>{JMS.name}</Text>
            <Text style={s.taglineText}>{JMS.tagline}</Text>
            <Text style={s.addrLine}>{JMS.address}</Text>
            <Text style={s.addrLine}>{JMS.phone}</Text>
          </View>
          <View style={s.titleBadge}>
            <Text style={s.titleBadgeText}>DRIVER{'\n'}STATEMENT</Text>
          </View>
        </View>
        <View style={s.navyStripe} />

        {/* Driver Info */}
        <View style={[s.pad, { marginTop: 10 }]}>
          <View style={s.driverInfoRow}>
            <View>
              <Text style={s.driverName}>{data.driver_name}</Text>
              <Text style={s.driverSub}>
                {data.vehicle_name}{data.vehicle_number ? ` · ${data.vehicle_number}` : ''}
                {' · '}Period: {fmtDate(data.period_from)} to {fmtDate(data.period_to)}
              </Text>
              {data.status === 'paid' && (
                <Text style={[s.driverSub, { color: TEAL, marginTop: 2 }]}>
                  PAID{data.paid_at ? ` · ${fmtDate(data.paid_at)}` : ''}
                  {data.payment_mode ? ` · ${MODE_LABELS[data.payment_mode] ?? data.payment_mode}` : ''}
                  {data.payment_reference ? ` · ${data.payment_reference}` : ''}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Trip Table */}
        <View style={s.pad}>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, { width: C.no }]}>#</Text>
            <Text style={[s.tableHeaderCell, { width: C.date }]}>Date</Text>
            <Text style={[s.tableHeaderCell, { width: C.ref }]}>Ref</Text>
            <Text style={[s.tableHeaderCell, { width: C.company }]}>Company</Text>
            <Text style={[s.tableHeaderCell, { width: C.kms, textAlign: 'right' }]}>KMs</Text>
            <Text style={[s.tableHeaderCell, { width: C.hire, textAlign: 'right' }]}>Hire Chg</Text>
            <Text style={[s.tableHeaderCell, { width: C.comm, textAlign: 'right' }]}>Comm{commPct ? `\n${commPct}%` : ''}</Text>
            <Text style={[s.tableHeaderCell, { width: C.share, textAlign: 'right' }]}>Drv Share</Text>
            <Text style={[s.tableHeaderCell, { width: C.bata, textAlign: 'right' }]}>Bata</Text>
            <Text style={[s.tableHeaderCell, { width: C.reimb, textAlign: 'right' }]}>Reimb</Text>
            <Text style={[s.tableHeaderCell, { width: C.total, textAlign: 'right' }]}>Total</Text>
          </View>

          {data.trips.map((t, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={[s.cell, { width: C.no, color: '#aaa' }]}>{i + 1}</Text>
              <Text style={[s.cell, { width: C.date }]}>{t.trip_date}</Text>
              <Text style={[s.cell, { width: C.ref, fontFamily: 'Helvetica-Bold' }]}>{t.booking_ref}</Text>
              <Text style={[s.cell, { width: C.company }]}>{t.company_name}</Text>
              <Text style={[s.cell, { width: C.kms, textAlign: 'right' }]}>{t.actual_kms}</Text>
              <Text style={[s.cell, { width: C.hire, textAlign: 'right' }]}>{rupees(t.client_hire_charges)}</Text>
              <Text style={[s.cell, { width: C.comm, textAlign: 'right', color: '#c00' }]}>-{rupees(t.client_hire_charges - t.hire_earnings)}</Text>
              <Text style={[s.cell, { width: C.share, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: NAVY }]}>{rupees(t.hire_earnings)}</Text>
              <Text style={[s.cell, { width: C.bata, textAlign: 'right' }]}>{rupees(t.bata_earnings)}</Text>
              <Text style={[s.cell, { width: C.reimb, textAlign: 'right' }]}>{rupees(t.toll_amount + t.parking_amount + t.permit_amount)}</Text>
              <Text style={[s.cell, { width: C.total, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{rupees(t.trip_total)}</Text>
            </View>
          ))}

          {/* Totals row */}
          <View style={[s.tableRow, { backgroundColor: '#eef2fb', borderTopWidth: 1.5, borderTopColor: NAVY }]}>
            <Text style={[s.cell, { width: C.no + C.date + C.ref + C.company + C.kms, fontFamily: 'Helvetica-Bold', color: NAVY }]}>TOTALS</Text>
            <Text style={[s.cell, { width: C.hire, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{rupees(data.trips.reduce((a, t) => a + t.client_hire_charges, 0))}</Text>
            <Text style={[s.cell, { width: C.comm, textAlign: 'right' }]}></Text>
            <Text style={[s.cell, { width: C.share, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: NAVY }]}>{rupees(data.hire_earnings)}</Text>
            <Text style={[s.cell, { width: C.bata, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{rupees(data.bata_earnings)}</Text>
            <Text style={[s.cell, { width: C.reimb, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{rupees(data.reimbursements)}</Text>
            <Text style={[s.cell, { width: C.total, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{rupees(data.gross_earnings)}</Text>
          </View>
        </View>

        {/* Settlement summary */}
        <View style={s.summaryBox}>
          <View style={s.summaryInner}>
            <View style={[s.summaryRow, { backgroundColor: '#eef2fb' }]}>
              <Text style={[s.summaryLabel, { fontFamily: 'Helvetica-Bold', color: NAVY }]}>EARNINGS BREAKDOWN</Text>
              <Text style={[s.summaryValue, { color: NAVY }]}></Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Hire Earnings</Text>
              <Text style={s.summaryValue}>{rupees(data.hire_earnings)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Bata Earnings</Text>
              <Text style={s.summaryValue}>{rupees(data.bata_earnings)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Reimbursements</Text>
              <Text style={s.summaryValue}>{rupees(data.reimbursements)}</Text>
            </View>
            {data.salary_amount > 0 && (
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Monthly Salary</Text>
                <Text style={s.summaryValue}>{rupees(data.salary_amount)}</Text>
              </View>
            )}
            <View style={[s.summaryRow, { borderTopWidth: 1, borderTopColor: NAVY }]}>
              <Text style={[s.summaryLabel, { fontFamily: 'Helvetica-Bold', color: NAVY }]}>Gross Earnings</Text>
              <Text style={[s.summaryValue, { color: NAVY }]}>{rupees(data.gross_earnings)}</Text>
            </View>
            {data.advance_principal_deduction > 0 && (
              <View style={s.summaryRow}>
                <Text style={[s.summaryLabel, { color: '#c00' }]}>Advance Deduction</Text>
                <Text style={[s.summaryValue, { color: '#c00' }]}>−{rupees(data.advance_principal_deduction)}</Text>
              </View>
            )}
            {data.advance_interest_deduction > 0 && (
              <View style={s.summaryRow}>
                <Text style={[s.summaryLabel, { color: '#c00' }]}>Interest ({data.interest_rate_pct ?? 2}%/mo)</Text>
                <Text style={[s.summaryValue, { color: '#c00' }]}>−{rupees(data.advance_interest_deduction)}</Text>
              </View>
            )}
            {data.other_deductions > 0 && (
              <View style={s.summaryRow}>
                <Text style={[s.summaryLabel, { color: '#c00' }]}>Other Deductions</Text>
                <Text style={[s.summaryValue, { color: '#c00' }]}>−{rupees(data.other_deductions)}</Text>
              </View>
            )}
            <View style={s.summaryTotal}>
              <Text style={s.summaryTotalLabel}>NET PAYABLE TO DRIVER</Text>
              <Text style={s.summaryTotalValue}>{rupees(data.net_payable)}</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{JMS.name} · Driver Statement · {data.driver_name} · {fmtDate(data.period_from)} – {fmtDate(data.period_to)}</Text>
          <Text style={s.footerText}>Driver Statement</Text>
        </View>
      </Page>
    </Document>
  )
}
