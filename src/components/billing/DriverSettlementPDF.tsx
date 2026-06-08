import { Document, Page, Text, View, Image } from '@react-pdf/renderer'

// ── Palette ──────────────────────────────────────────────────────────────────
const NAVY   = '#1e3a5c'
const NAV2   = '#2a4d70'   // column header row bg (slightly lighter navy)
const ACCENT = '#1565a8'   // left accent bar on driver name
const GR     = '#edf2f7'   // alternating row tint
const GR2    = '#dce5ef'   // totals / gross earnings row
const WH     = '#ffffff'
const BK     = '#1a202c'   // near-black text
const BORDER = '#b8c4d0'   // cell borders
const NEG    = '#b91c1c'   // commission / negative values
const BOLD   = 'Helvetica-Bold'
const REG    = 'Helvetica'

const JMS = {
  name:    'J M S TRAVELS',
  tagline: 'we take pride in your ride',
  address: '#14/17, 15th Cross, Eshwar Layout, Indira Nagar, Bangalore-560038',
  contact: '+91 98455 72207 / 809540 3101',
}

// ── Column widths ─────────────────────────────────────────────────────────────
// Trip table: A4 portrait 555pt usable (20pt padding each side)
// Comm + Drv Share columns removed; width redistributed to Company, Hire, Bata, Reimb, Total
const TW = {
  no: 16, date: 44, ref: 62, ts: 36, company: 100,
  kms: 28, hrs: 26, hire: 70,
  bata: 44, reimb: 48, total: 81,
}
// 16+44+62+36+100+28+26+70+44+48+81 = 555 ✓
const TW_LABEL = TW.no + TW.date + TW.ref + TW.ts + TW.company  // 258, for TOTALS cell

// Bottom section: DW + GAP + SBW = 555
const DW  = 310   // deductions table width
const GAP = 8
const SBW = 237   // summary box width

// Deductions table: 5 columns  no | date | type | mode | amount  inside DW = 310
const DD = { no: 20, date: 46, type: 74, mode: 82, amt: 88 }  // 20+46+74+82+88 = 310 ✓
const DD_LABEL = DD.no + DD.date + DD.type + DD.mode           // 222, for TOTAL DEDUCTIONS cell

// Summary box columns inside SBW = 237
const SB = { label: 157, val: 80 }  // 157+80 = 237 ✓

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt2(n: number): string { return n.toFixed(2) }

function fmtDateShort(d: string): string {
  if (!d) return ''
  const parts = d.split('-')
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`
}

function fmtDateFull(d: string): string {
  if (!d) return ''
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const parts = d.split('-')
  return `${parseInt(parts[2])} ${months[parseInt(parts[1]) - 1]} ${parts[0]}`
}

function fmtHrs(hrs: number, tripType: string, totalDays: number): string {
  if (tripType === 'outstation') return `${totalDays}d`
  return hrs > 0 ? `${Math.round(hrs)}h` : ''
}

// Header cell (white text on navy background)
function th(width: number, align: 'left' | 'center' | 'right' = 'left', last = false) {
  return {
    width,
    fontSize: 6.5,
    fontFamily: BOLD,
    color: WH,
    textAlign: align,
    paddingHorizontal: 3,
    paddingVertical: 3,
    borderRightWidth: last ? 0 : 0.5,
    borderRightColor: NAV2,
  }
}

// Data cell
function td(
  width: number,
  align: 'left' | 'center' | 'right' = 'left',
  bg = WH,
  opts: { bold?: boolean; last?: boolean; color?: string; sz?: number } = {}
) {
  return {
    width,
    fontSize: opts.sz ?? 7,
    fontFamily: opts.bold ? BOLD : REG,
    color: opts.color ?? BK,
    textAlign: align,
    backgroundColor: bg,
    paddingHorizontal: 3,
    paddingVertical: 2.5,
    borderRightWidth: opts.last ? 0 : 0.5,
    borderRightColor: BORDER,
  }
}

const bRow = { flexDirection: 'row' as const, borderBottomWidth: 0.5, borderBottomColor: BORDER }

// ── Helpers for advance section ───────────────────────────────────────────────
const ADV_MODE_LABELS: Record<string, string> = {
  cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank Tf.',
  cheque: 'Cheque', neft: 'NEFT', rtgs: 'RTGS',
  phonepe: 'PhonePe', gpay: 'GPay',
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AdvanceEntry {
  date: string          // YYYY-MM-DD
  type: 'advance' | 'collection'
  payment_mode: string
  amount: number
  note: string | null
}

export interface TripLine {
  trip_date: string
  booking_ref: string
  tripsheet_number: string | null
  company_name: string
  trip_type: string
  actual_kms: number
  actual_hrs: number
  total_days: number
  client_hire_charges: number
  commission_percent: number
  hire_earnings: number
  bata_count: number
  bata_earnings: number
  toll_amount: number
  parking_amount: number
  permit_amount: number
  trip_total: number
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
  advance_entries?: AdvanceEntry[]
  net_payable: number
  payment_mode?: string | null
  payment_reference?: string | null
  paid_at?: string | null
  status: string
}

// ── Component ─────────────────────────────────────────────────────────────────
export function DriverSettlementPDF({ data }: { data: DriverSettlementPDFData }) {
  const totalKms        = data.trips.reduce((a, t) => a + t.actual_kms, 0)
  const totalBata       = data.trips.reduce((a, t) => a + t.bata_earnings, 0)
  const totalReimb      = data.trips.reduce((a, t) => a + t.toll_amount + t.parking_amount + t.permit_amount, 0)
  const totalRow        = data.trips.reduce((a, t) => a + t.trip_total, 0)
  const totalClientHire = data.trips.reduce((a, t) => a + t.client_hire_charges, 0)
  const totalComm       = totalClientHire - data.hire_earnings
  const commPct         = data.trips[0]?.commission_percent ?? 0
  const iRate           = data.interest_rate_pct ?? 2

  const hasAdvEntries = (data.advance_entries?.length ?? 0) > 0
  const hasDed = hasAdvEntries
    || data.advance_principal_deduction > 0
    || data.advance_interest_deduction > 0
    || data.other_deductions > 0
  const totalDed = data.advance_principal_deduction
    + data.advance_interest_deduction
    + data.other_deductions

  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const stmtDate = `${String(now.getUTCDate()).padStart(2,'0')}/${String(now.getUTCMonth()+1).padStart(2,'0')}/${now.getUTCFullYear()}`

  return (
    <Document>
      <Page size="A4" style={{ fontFamily: REG, fontSize: 7, color: BK, padding: 20, backgroundColor: WH }}>

        {/* ══════════ HEADER ══════════ */}
        <View style={{ flexDirection: 'row', backgroundColor: NAVY, marginBottom: 10, alignItems: 'stretch' }}>
          {/* Logo */}
          <View style={{
            width: 70, alignItems: 'center', justifyContent: 'center',
            borderRightWidth: 0.5, borderRightColor: NAV2, paddingVertical: 8,
          }}>
            {data.logoSrc
              ? <Image src={data.logoSrc} style={{ width: 54, height: 54, objectFit: 'contain' }} />
              : ['J', 'M', 'S'].map(l => (
                  <Text key={l} style={{ fontSize: 20, fontFamily: BOLD, color: WH, lineHeight: 1.15 }}>{l}</Text>
                ))
            }
          </View>

          {/* Company info */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 }}>
            <Text style={{ fontSize: 15, fontFamily: BOLD, color: WH, letterSpacing: 2 }}>{JMS.name}</Text>
            <Text style={{ fontSize: 6.5, color: '#8ab0cc', marginTop: 2 }}>{JMS.tagline}</Text>
            <Text style={{ fontSize: 6.5, color: '#c5d9e8', marginTop: 3 }}>{JMS.address}</Text>
            <Text style={{ fontSize: 6.5, color: '#c5d9e8', marginTop: 1 }}>{JMS.contact}</Text>
          </View>

          {/* DRIVER STATEMENT badge */}
          <View style={{
            width: 70, alignItems: 'center', justifyContent: 'center',
            borderLeftWidth: 0.5, borderLeftColor: NAV2, paddingVertical: 8,
          }}>
            <View style={{ borderWidth: 1.5, borderColor: WH, paddingHorizontal: 6, paddingVertical: 6 }}>
              <Text style={{ fontSize: 8, fontFamily: BOLD, color: WH, textAlign: 'center' }}>DRIVER</Text>
              <Text style={{ fontSize: 8, fontFamily: BOLD, color: WH, textAlign: 'center' }}>STATEMENT</Text>
            </View>
          </View>
        </View>

        {/* ══════════ DRIVER INFO ══════════ */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 2 }}>
          <View style={{ width: 4, height: 38, backgroundColor: ACCENT, marginRight: 8 }} />
          <View>
            <Text style={{ fontSize: 14, fontFamily: BOLD, color: NAVY }}>{data.driver_name}</Text>
            <Text style={{ fontSize: 7.5, color: '#4a5568', marginTop: 3 }}>
              {[
                data.vehicle_name || null,
                data.vehicle_number || null,
                `Period: ${fmtDateFull(data.period_from)} to ${fmtDateFull(data.period_to)}`,
                `Statement Date: ${stmtDate}`,
              ].filter(Boolean).join('  ·  ')}
            </Text>
          </View>
        </View>

        {/* ══════════ SECTION 1: TRIP DETAILS ══════════ */}
        <View style={{ backgroundColor: NAVY, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ fontSize: 7.5, fontFamily: BOLD, color: WH, letterSpacing: 0.8 }}>TRIP DETAILS</Text>
        </View>

        {/* Trip table column headers */}
        <View style={{ flexDirection: 'row', backgroundColor: NAV2, borderBottomWidth: 1, borderBottomColor: NAVY }}>
          <Text style={th(TW.no,      'center')}>{'#'}</Text>
          <Text style={th(TW.date,    'left')}>{'Date'}</Text>
          <Text style={th(TW.ref,     'left')}>{'Ref'}</Text>
          <Text style={th(TW.ts,      'left')}>{'TS#'}</Text>
          <Text style={th(TW.company, 'left')}>{'Company'}</Text>
          <Text style={th(TW.kms,     'right')}>{'KMs'}</Text>
          <Text style={th(TW.hrs,     'right')}>{'Hrs'}</Text>
          <Text style={th(TW.hire,    'right')}>{'Hire Earn'}</Text>
          <Text style={th(TW.bata,    'right')}>{'Bata'}</Text>
          <Text style={th(TW.reimb,   'right')}>{'Toll/Park'}</Text>
          <Text style={th(TW.total,   'right', true)}>{'Total'}</Text>
        </View>

        {/* Trip data rows */}
        {data.trips.map((t, i) => {
          const reimb = t.toll_amount + t.parking_amount + t.permit_amount
          const bg    = i % 2 === 1 ? GR : WH
          return (
            <View key={i} style={{ ...bRow, backgroundColor: bg, minHeight: 13 }}>
              <Text style={{ ...td(TW.no,      'center', bg), color: '#718096' }}>{i + 1}</Text>
              <Text style={td(TW.date,          'left',   bg)}>{fmtDateShort(t.trip_date)}</Text>
              <Text style={td(TW.ref,           'left',   bg, { bold: true, sz: 6.5 })}>{t.booking_ref}</Text>
              <Text style={td(TW.ts,            'left',   bg, { sz: 6.5 })}>{t.tripsheet_number ?? ''}</Text>
              <Text style={td(TW.company,       'left',   bg, { sz: 6.5 })}>{t.company_name}</Text>
              <Text style={td(TW.kms,           'right',  bg)}>{t.actual_kms > 0 ? t.actual_kms.toFixed(1) : ''}</Text>
              <Text style={td(TW.hrs,           'right',  bg)}>{fmtHrs(t.actual_hrs, t.trip_type, t.total_days)}</Text>
              <Text style={td(TW.hire,          'right',  bg)}>{t.hire_earnings > 0 ? fmt2(t.hire_earnings) : ''}</Text>
              <Text style={td(TW.bata,          'right',  bg)}>{t.bata_earnings > 0 ? fmt2(t.bata_earnings) : ''}</Text>
              <Text style={td(TW.reimb,         'right',  bg)}>{reimb > 0 ? fmt2(reimb) : ''}</Text>
              <Text style={td(TW.total,         'right',  bg, { bold: true, last: true })}>{t.trip_total > 0 ? fmt2(t.trip_total) : ''}</Text>
            </View>
          )
        })}

        {/* TOTALS row */}
        <View style={{ flexDirection: 'row', backgroundColor: GR2, borderTopWidth: 1, borderTopColor: NAVY, borderBottomWidth: 1, borderBottomColor: NAVY }}>
          <Text style={td(TW_LABEL,  'right', GR2, { bold: true, sz: 7.5 })}>TOTALS</Text>
          <Text style={td(TW.kms,   'right', GR2, { bold: true })}>{totalKms > 0 ? totalKms.toFixed(1) : ''}</Text>
          <Text style={td(TW.hrs,   'right', GR2)}>{''}</Text>
          <Text style={td(TW.hire,  'right', GR2, { bold: true })}>{fmt2(data.hire_earnings)}</Text>
          <Text style={td(TW.bata,  'right', GR2, { bold: true })}>{fmt2(totalBata)}</Text>
          <Text style={td(TW.reimb, 'right', GR2, { bold: true })}>{fmt2(totalReimb)}</Text>
          <Text style={td(TW.total, 'right', GR2, { bold: true, last: true, sz: 7.5 })}>{fmt2(totalRow)}</Text>
        </View>

        {/* ══════════ BOTTOM SECTION ══════════ */}
        <View style={{ flexDirection: 'row', marginTop: 12 }}>

          {/* ── LEFT: ADVANCE & DEDUCTIONS ── */}
          <View style={{ width: DW }}>
            <View style={{ backgroundColor: NAVY, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 7.5, fontFamily: BOLD, color: WH, letterSpacing: 0.8 }}>ADVANCE &amp; DEDUCTIONS</Text>
            </View>

            {hasDed ? (
              <>
                {/* Column headers */}
                <View style={{ flexDirection: 'row', backgroundColor: NAV2, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
                  <Text style={th(DD.no,   'center')}>#</Text>
                  <Text style={th(DD.date, 'left')}>Date</Text>
                  <Text style={th(DD.type, 'left')}>Type</Text>
                  <Text style={th(DD.mode, 'left')}>Mode</Text>
                  <Text style={th(DD.amt,  'right', true)}>Amount</Text>
                </View>

                {/* Individual advance entries (or fallback aggregated row) */}
                {hasAdvEntries
                  ? data.advance_entries!.map((e, i) => {
                      const bg = i % 2 === 0 ? WH : GR
                      const typeLabel = e.type === 'collection' ? 'Client Coll.' : 'Advance'
                      const modeLabel = ADV_MODE_LABELS[e.payment_mode] ?? e.payment_mode
                      return (
                        <View key={i} style={{ ...bRow, backgroundColor: bg, minHeight: 14 }}>
                          <Text style={{ ...td(DD.no,   'center', bg), color: '#718096' }}>{i + 1}</Text>
                          <Text style={td(DD.date, 'left', bg)}>{fmtDateShort(e.date)}</Text>
                          <Text style={td(DD.type, 'left', bg, { sz: 6.5 })}>{typeLabel}</Text>
                          <Text style={td(DD.mode, 'left', bg, { sz: 6.5 })}>{modeLabel}</Text>
                          <Text style={td(DD.amt,  'right', bg, { last: true })}>{fmt2(e.amount)}</Text>
                        </View>
                      )
                    })
                  : data.advance_principal_deduction > 0
                    ? (() => { const bg = WH; return (
                        <View style={{ ...bRow, backgroundColor: bg, minHeight: 14 }}>
                          <Text style={{ ...td(DD.no,   'center', bg), color: '#718096' }}>1</Text>
                          <Text style={td(DD.date, 'left', bg)}>—</Text>
                          <Text style={td(DD.type, 'left', bg, { sz: 6.5 })}>Advance</Text>
                          <Text style={td(DD.mode, 'left', bg, { sz: 6.5 })}>—</Text>
                          <Text style={td(DD.amt,  'right', bg, { last: true })}>{fmt2(data.advance_principal_deduction)}</Text>
                        </View>
                      )})()
                    : null
                }

                {/* Interest row */}
                {data.advance_interest_deduction > 0 && (() => {
                  const rowIdx = hasAdvEntries ? data.advance_entries!.length : (data.advance_principal_deduction > 0 ? 1 : 0)
                  const bg = rowIdx % 2 === 0 ? WH : GR
                  return (
                    <View style={{ ...bRow, backgroundColor: bg, minHeight: 14 }}>
                      <Text style={{ ...td(DD.no,   'center', bg), color: '#718096' }}>{rowIdx + 1}</Text>
                      <Text style={td(DD.date, 'left', bg)}>—</Text>
                      <Text style={td(DD.type, 'left', bg, { sz: 6.5 })}>Interest</Text>
                      <Text style={td(DD.mode, 'left', bg, { sz: 6.5 })}>{iRate}% / mo</Text>
                      <Text style={td(DD.amt,  'right', bg, { last: true })}>{fmt2(data.advance_interest_deduction)}</Text>
                    </View>
                  )
                })()}

                {/* Other deductions row */}
                {data.other_deductions > 0 && (() => {
                  const rowIdx = (hasAdvEntries ? data.advance_entries!.length : (data.advance_principal_deduction > 0 ? 1 : 0))
                    + (data.advance_interest_deduction > 0 ? 1 : 0)
                  const bg = rowIdx % 2 === 0 ? WH : GR
                  return (
                    <View style={{ ...bRow, backgroundColor: bg, minHeight: 14 }}>
                      <Text style={{ ...td(DD.no,   'center', bg), color: '#718096' }}>{rowIdx + 1}</Text>
                      <Text style={td(DD.date, 'left', bg)}>—</Text>
                      <Text style={td(DD.type, 'left', bg, { sz: 6.5 })}>Other</Text>
                      <Text style={td(DD.mode, 'left', bg, { sz: 6.5 })}>—</Text>
                      <Text style={td(DD.amt,  'right', bg, { last: true })}>{fmt2(data.other_deductions)}</Text>
                    </View>
                  )
                })()}

                {/* Total deductions */}
                <View style={{ flexDirection: 'row', backgroundColor: GR2, borderTopWidth: 1, borderTopColor: NAVY, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
                  <Text style={td(DD_LABEL, 'right', GR2, { bold: true })}>TOTAL DEDUCTIONS</Text>
                  <Text style={td(DD.amt,   'right', GR2, { bold: true, last: true, sz: 7.5 })}>{fmt2(totalDed)}</Text>
                </View>
              </>
            ) : (
              <View style={{ borderWidth: 0.5, borderTopWidth: 0, borderColor: BORDER, padding: 10 }}>
                <Text style={{ fontSize: 7, color: '#718096' }}>No advance deductions for this settlement period.</Text>
              </View>
            )}

            {/* Signature lines */}
            <View style={{ marginTop: 14, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 7, color: '#555', marginBottom: 10 }}>By Cash / Cheque No.  ________________________________</Text>
              <Text style={{ fontSize: 7, color: '#555' }}>Accounts  _________________________________________</Text>
            </View>
          </View>

          {/* Gap between the two panels */}
          <View style={{ width: GAP }} />

          {/* ── RIGHT: SETTLEMENT SUMMARY ── */}
          <View style={{ width: SBW }}>
            <View style={{ backgroundColor: NAVY, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 7.5, fontFamily: BOLD, color: WH, letterSpacing: 0.8 }}>SETTLEMENT SUMMARY</Text>
            </View>

            {/* Earnings rows — Option B: gross hire → commission → driver net */}
            {/* Hire Charges (gross from client) */}
            <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER, minHeight: 16, alignItems: 'center' }}>
              <Text style={{ width: SB.label, fontSize: 7.5, paddingHorizontal: 8, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: BORDER }}>Hire Charges</Text>
              <Text style={{ width: SB.val,   fontSize: 7.5, paddingHorizontal: 8, paddingVertical: 3, textAlign: 'right' }}>{fmt2(totalClientHire)}</Text>
            </View>
            {/* Commission deduction (red sub-line) */}
            {totalComm > 0 && (
              <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER, minHeight: 15, alignItems: 'center', backgroundColor: '#fef2f2' }}>
                <Text style={{ width: SB.label, fontSize: 7, color: NEG, paddingHorizontal: 8, paddingLeft: 14, paddingVertical: 2.5, borderRightWidth: 0.5, borderRightColor: BORDER }}>
                  {`− ${commPct}% Commission`}
                </Text>
                <Text style={{ width: SB.val, fontSize: 7, color: NEG, paddingHorizontal: 8, paddingVertical: 2.5, textAlign: 'right' }}>
                  {`−${fmt2(totalComm)}`}
                </Text>
              </View>
            )}
            {/* Driver Net Hire */}
            <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER, minHeight: 16, alignItems: 'center', backgroundColor: '#f0f4ff' }}>
              <Text style={{ width: SB.label, fontSize: 7.5, fontFamily: BOLD, paddingHorizontal: 8, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: BORDER }}>Driver Net Hire</Text>
              <Text style={{ width: SB.val,   fontSize: 7.5, fontFamily: BOLD, paddingHorizontal: 8, paddingVertical: 3, textAlign: 'right' }}>{fmt2(data.hire_earnings)}</Text>
            </View>
            {/* Bata Earnings */}
            <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER, minHeight: 16, alignItems: 'center' }}>
              <Text style={{ width: SB.label, fontSize: 7.5, paddingHorizontal: 8, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: BORDER }}>Bata Earnings</Text>
              <Text style={{ width: SB.val,   fontSize: 7.5, paddingHorizontal: 8, paddingVertical: 3, textAlign: 'right' }}>{fmt2(data.bata_earnings)}</Text>
            </View>
            {/* Toll, Parking and Permit */}
            <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER, minHeight: 16, alignItems: 'center' }}>
              <Text style={{ width: SB.label, fontSize: 7.5, paddingHorizontal: 8, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: BORDER }}>Toll, Parking and Permit</Text>
              <Text style={{ width: SB.val,   fontSize: 7.5, paddingHorizontal: 8, paddingVertical: 3, textAlign: 'right' }}>{fmt2(data.reimbursements)}</Text>
            </View>
            {data.salary_amount > 0 && (
              <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER, minHeight: 16, alignItems: 'center' }}>
                <Text style={{ width: SB.label, fontSize: 7.5, paddingHorizontal: 8, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: BORDER }}>Monthly Salary</Text>
                <Text style={{ width: SB.val,   fontSize: 7.5, paddingHorizontal: 8, paddingVertical: 3, textAlign: 'right' }}>{fmt2(data.salary_amount)}</Text>
              </View>
            )}

            {/* Gross Earnings */}
            <View style={{ flexDirection: 'row', backgroundColor: GR2, borderTopWidth: 1, borderTopColor: NAVY, borderBottomWidth: 0.5, borderBottomColor: BORDER, minHeight: 18, alignItems: 'center' }}>
              <Text style={{ width: SB.label, fontSize: 8, fontFamily: BOLD, paddingHorizontal: 8, paddingVertical: 4, borderRightWidth: 0.5, borderRightColor: BORDER }}>Gross Earnings</Text>
              <Text style={{ width: SB.val,   fontSize: 8, fontFamily: BOLD, paddingHorizontal: 8, paddingVertical: 4, textAlign: 'right' }}>{fmt2(data.gross_earnings)}</Text>
            </View>

            {/* Total Advance Deductions line (only if any) */}
            {hasDed && (
              <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER, minHeight: 16, alignItems: 'center' }}>
                <Text style={{ width: SB.label, fontSize: 7.5, paddingHorizontal: 8, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: BORDER }}>Total Advance Deductions</Text>
                <Text style={{ width: SB.val,   fontSize: 7.5, color: NEG, paddingHorizontal: 8, paddingVertical: 3, textAlign: 'right' }}>-{fmt2(totalDed)}</Text>
              </View>
            )}

            {/* NET PAYABLE TO DRIVER */}
            <View style={{ flexDirection: 'row', backgroundColor: NAVY, minHeight: 24, alignItems: 'center' }}>
              <Text style={{ width: SB.label, fontSize: 9, fontFamily: BOLD, color: WH, paddingHorizontal: 8, paddingVertical: 5, borderRightWidth: 0.5, borderRightColor: NAV2 }}>
                NET PAYABLE TO DRIVER
              </Text>
              <Text style={{ width: SB.val, fontSize: 9, fontFamily: BOLD, color: WH, paddingHorizontal: 8, paddingVertical: 5, textAlign: 'right' }}>
                {fmt2(data.net_payable)}
              </Text>
            </View>
          </View>

        </View>

        {/* ══════════ SIGNATURE ROW ══════════ */}
        <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: BORDER, marginTop: 16, paddingTop: 10 }}>
          <Text style={{ flex: 1, fontSize: 7, textAlign: 'center', color: '#555' }}>Proprietor</Text>
          <Text style={{ flex: 1, fontSize: 7, textAlign: 'center', color: '#555' }}>Manager</Text>
          <Text style={{ flex: 1, fontSize: 7, textAlign: 'center', color: '#555' }}>{"Receiver's Signature"}</Text>
        </View>

        {/* ══════════ DOCUMENT FOOTER ══════════ */}
        <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#dde3eb', marginTop: 8, paddingTop: 4 }}>
          <Text style={{ flex: 1, fontSize: 6, color: '#aaa' }}>
            {JMS.name}{'  ·  '}Driver Statement{'  ·  '}{data.driver_name}{'  ·  '}{fmtDateFull(data.period_from)} {'–'} {fmtDateFull(data.period_to)}
          </Text>
          <Text style={{ fontSize: 6, color: '#aaa' }}>Driver Statement</Text>
        </View>

      </Page>
    </Document>
  )
}
