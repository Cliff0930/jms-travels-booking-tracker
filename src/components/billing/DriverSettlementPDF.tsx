import { Document, Page, Text, View, Image } from '@react-pdf/renderer'

const BK = '#000000'
const GR = '#d4d4d4'  // header / total row background
const LG = '#f5f5f5'  // alternating row tint
const WH = '#ffffff'
const BOLD = 'Helvetica-Bold'
const REG  = 'Helvetica'

const JMS = {
  name: 'J M S TRAVELS',
  address: '#14/17, 15th Cross, Eshwar Layout, Indira Nagar, Bangalore-560038',
  contact: 'Ph: +91 98455 72207 / 809540 3101 / 9480 165 207    e-Mail: jmstravelprabhu@gmail.com',
}

// ── Column widths (A4 portrait, 20pt margins → 555pt usable) ────────────────
// Left trip table
const LW = { no: 18, date: 48, ts: 56, kms: 34, hrs: 36, credit: 62, toll: 50 } // = 304
// Gap between the two tables
const GAP = 8
// Right expense reference table
const RW = { vno: 65, name: 115, amount: 63 } // = 243
// Total: 304 + 8 + 243 = 555 ✓

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt2(n: number): string {
  return n.toFixed(2)
}

function fmtDateShort(d: string): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y.slice(2)}`
}

function fmtDateFull(d: string): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fmtHrs(hrs: number, tripType: string, totalDays: number): string {
  if (tripType === 'outstation') {
    return `${totalDays} day${totalDays !== 1 ? 's' : ''}`
  }
  return hrs > 0 ? String(Math.round(hrs)) : ''
}

// Shared base for a data cell
function dc(
  width: number,
  opts: { bold?: boolean; right?: boolean; center?: boolean; bg?: string; noBorderRight?: boolean } = {}
) {
  return {
    width,
    fontFamily: opts.bold ? BOLD : REG,
    fontSize: 7,
    textAlign: (opts.right ? 'right' : opts.center ? 'center' : 'left') as 'right' | 'center' | 'left',
    backgroundColor: opts.bg ?? WH,
    paddingHorizontal: 3,
    paddingVertical: 2,
    borderRightWidth: opts.noBorderRight ? 0 : 0.5,
    borderRightColor: BK,
  }
}

// Shared base for a header cell
function hc(
  width: number,
  opts: { right?: boolean; center?: boolean; noBorderRight?: boolean } = {}
) {
  return {
    ...dc(width, { bold: true, bg: GR, right: opts.right, center: opts.center, noBorderRight: opts.noBorderRight }),
    fontSize: 6.5,
    paddingVertical: 3,
  }
}

const bRow = {
  flexDirection: 'row' as const,
  borderBottomWidth: 0.5,
  borderBottomColor: BK,
}

// ── Types ────────────────────────────────────────────────────────────────────

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
  net_payable: number
  payment_mode?: string | null
  payment_reference?: string | null
  paid_at?: string | null
  status: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function DriverSettlementPDF({ data }: { data: DriverSettlementPDFData }) {
  // Totals from trip rows
  const totalKms    = data.trips.reduce((a, t) => a + t.actual_kms, 0)
  const totalCredit = data.trips.reduce((a, t) => a + t.client_hire_charges, 0)
  const totalToll   = data.trips.reduce((a, t) => a + t.toll_amount + t.parking_amount + t.permit_amount, 0)
  const totalTollBreakdown = {
    toll:    data.trips.reduce((a, t) => a + t.toll_amount, 0),
    parking: data.trips.reduce((a, t) => a + t.parking_amount, 0),
    permit:  data.trips.reduce((a, t) => a + t.permit_amount, 0),
  }

  const commPct        = data.trips[0]?.commission_percent ?? 0
  const totalCommission = data.trips.reduce((a, t) => a + (t.client_hire_charges - t.hire_earnings), 0)
  const interestPct     = data.interest_rate_pct ?? 2

  // Grand total = all money owed to driver before deductions
  const grandTotal    = totalCredit + data.bata_earnings + totalToll + data.salary_amount
  const totalDeductions = totalCommission
    + data.advance_principal_deduction
    + data.advance_interest_deduction
    + (data.other_deductions ?? 0)

  // Statement date (IST)
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const stmtDate = `${String(now.getUTCDate()).padStart(2,'0')}/${String(now.getUTCMonth()+1).padStart(2,'0')}/${now.getUTCFullYear()}`

  return (
    <Document>
      <Page size="A4" style={{ fontFamily: REG, fontSize: 7, color: BK, padding: 20, backgroundColor: WH }}>
        {/* ═══ Outer border box ═══ */}
        <View style={{ borderWidth: 1, borderColor: BK, flex: 1 }}>

          {/* ── Header ── */}
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BK, alignItems: 'center', padding: 6 }}>
            {/* Logo area */}
            <View style={{ width: 52, alignItems: 'center', borderWidth: 1, borderColor: BK, paddingVertical: 3, marginRight: 8 }}>
              {data.logoSrc
                ? <Image src={data.logoSrc} style={{ width: 48, height: 48, objectFit: 'contain' }} />
                : ['J', 'M', 'S'].map(l => (
                    <Text key={l} style={{ fontSize: 20, fontFamily: BOLD, lineHeight: 1.15 }}>{l}</Text>
                  ))
              }
            </View>
            {/* Company info */}
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontFamily: BOLD }}>{JMS.name}</Text>
              <Text style={{ fontSize: 6.5, marginTop: 3 }}>{JMS.address}</Text>
              <Text style={{ fontSize: 6.5, marginTop: 1 }}>{JMS.contact}</Text>
            </View>
          </View>

          {/* ── Title: VEHICLE STATEMENT ── */}
          <View style={{ alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: BK }}>
            <View style={{ borderWidth: 1, borderColor: BK, paddingHorizontal: 18, paddingVertical: 3 }}>
              <Text style={{ fontSize: 9, fontFamily: BOLD, letterSpacing: 1.5 }}>VEHICLE STATEMENT</Text>
            </View>
          </View>

          {/* ── Info rows ── */}
          {/* Row 1: Name of Owner  |  No: */}
          <View style={{ ...bRow, minHeight: 16 }}>
            <Text style={{ width: 92, fontFamily: BOLD, paddingHorizontal: 4, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: BK }}>NAME OF OWNER</Text>
            <Text style={{ flex: 1, paddingHorizontal: 4, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: BK }}>{data.driver_name}</Text>
            <Text style={{ width: 28, fontFamily: BOLD, paddingHorizontal: 4, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: BK }}>No:</Text>
            <Text style={{ width: 70, paddingHorizontal: 4, paddingVertical: 3 }}></Text>
          </View>
          {/* Row 2: Vehicle No  |  Date */}
          <View style={{ ...bRow, minHeight: 16 }}>
            <Text style={{ width: 92, fontFamily: BOLD, paddingHorizontal: 4, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: BK }}>VEHICLE NO.</Text>
            <Text style={{ flex: 1, paddingHorizontal: 4, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: BK }}>
              {data.vehicle_number}{data.vehicle_name ? `  (${data.vehicle_name})` : ''}
            </Text>
            <Text style={{ width: 28, fontFamily: BOLD, paddingHorizontal: 4, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: BK }}>Date:</Text>
            <Text style={{ width: 70, paddingHorizontal: 4, paddingVertical: 3 }}>{stmtDate}</Text>
          </View>
          {/* Row 3: Period */}
          <View style={{ ...bRow, minHeight: 16 }}>
            <Text style={{ width: 92, fontFamily: BOLD, paddingHorizontal: 4, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: BK }}>PERIOD</Text>
            <Text style={{ flex: 1, fontFamily: BOLD, paddingHorizontal: 4, paddingVertical: 3 }}>
              {fmtDateFull(data.period_from)}  To  {fmtDateFull(data.period_to)}
            </Text>
          </View>

          {/* ── Table header ── */}
          <View style={{ ...bRow, backgroundColor: GR, borderTopWidth: 1, borderTopColor: BK }}>
            <Text style={hc(LW.no,     { center: true })}>{'Sl.\nNo.'}</Text>
            <Text style={hc(LW.date,   { center: true })}>Date</Text>
            <Text style={hc(LW.ts,     { center: true })}>{'TRIP\nSHEET No.'}</Text>
            <Text style={hc(LW.kms,    { right: true })}>KMS.</Text>
            <Text style={hc(LW.hrs,    { right: true })}>HRS.</Text>
            <Text style={hc(LW.credit, { right: true })}>CREDIT</Text>
            <Text style={hc(LW.toll,   { right: true })}>toll</Text>
            {/* Gap */}
            <View style={{ width: GAP, backgroundColor: GR, borderRightWidth: 0.5, borderRightColor: BK }} />
            {/* Right table */}
            <Text style={hc(RW.vno,    { center: true })}>v.no</Text>
            <Text style={hc(RW.name,   { center: true })}>EXPENSE NAME</Text>
            <Text style={hc(RW.amount, { right: true, noBorderRight: true })}>AMOUNT</Text>
          </View>

          {/* ── Trip rows ── */}
          {data.trips.map((t, i) => {
            const toll = t.toll_amount + t.parking_amount + t.permit_amount
            const bg   = i % 2 === 1 ? LG : WH
            return (
              <View key={i} style={{ ...bRow, backgroundColor: bg, minHeight: 13 }}>
                <Text style={{ ...dc(LW.no,     { bg }), textAlign: 'center' }}>{i + 1}</Text>
                <Text style={dc(LW.date,   { bg })}>{fmtDateShort(t.trip_date)}</Text>
                <Text style={dc(LW.ts,     { bg })}>{t.tripsheet_number ?? ''}</Text>
                <Text style={{ ...dc(LW.kms, { bg }), textAlign: 'right' }}>{t.actual_kms > 0 ? t.actual_kms.toFixed(2) : ''}</Text>
                <Text style={{ ...dc(LW.hrs, { bg }), textAlign: 'right' }}>{fmtHrs(t.actual_hrs, t.trip_type, t.total_days)}</Text>
                <Text style={{ ...dc(LW.credit, { bg }), textAlign: 'right' }}>{t.client_hire_charges > 0 ? fmt2(t.client_hire_charges) : ''}</Text>
                <Text style={{ ...dc(LW.toll,   { bg }), textAlign: 'right' }}>{toll > 0 ? fmt2(toll) : ''}</Text>
                {/* Gap */}
                <View style={{ width: GAP, backgroundColor: bg, borderRightWidth: 0.5, borderRightColor: BK }} />
                {/* Right: booking ref as v.no, expense cols empty */}
                <Text style={{ ...dc(RW.vno,  { bg }), fontSize: 6.5 }}>{t.booking_ref}</Text>
                <Text style={dc(RW.name,   { bg })}></Text>
                <Text style={{ ...dc(RW.amount, { bg, noBorderRight: true }), textAlign: 'right' }}></Text>
              </View>
            )
          })}

          {/* ── TOTAL row ── */}
          <View style={{ ...bRow, backgroundColor: GR, borderTopWidth: 1, borderTopColor: BK }}>
            <Text style={dc(LW.no + LW.date, { bold: true, bg: GR })}></Text>
            <Text style={dc(LW.ts,     { bold: true, bg: GR })}>TOTAL</Text>
            <Text style={{ ...dc(LW.kms, { bold: true, bg: GR }), textAlign: 'right' }}>{totalKms.toFixed(2)}</Text>
            <Text style={{ ...dc(LW.hrs, { bold: true, bg: GR }), textAlign: 'right' }}></Text>
            <Text style={{ ...dc(LW.credit, { bold: true, bg: GR }), textAlign: 'right' }}>{fmt2(totalCredit)}</Text>
            <Text style={{ ...dc(LW.toll,   { bold: true, bg: GR }), textAlign: 'right' }}>{fmt2(totalToll)}</Text>
            <View style={{ width: GAP, backgroundColor: GR, borderRightWidth: 0.5, borderRightColor: BK }} />
            <Text style={{ ...dc(RW.vno + RW.name, { bold: true, bg: GR }) }}>TOTAL</Text>
            <Text style={{ ...dc(RW.amount, { bold: true, bg: GR, noBorderRight: true }), textAlign: 'right' }}>0.00</Text>
          </View>

          {/* ═══ Bottom section ═══ */}
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: BK }}>

            {/* ── LEFT: Expense Summary ── */}
            <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: BK }}>
              {/* Expense table header */}
              <View style={{ ...bRow, backgroundColor: GR }}>
                <Text style={hc(20)}>{'  '}</Text>
                <Text style={{ ...hc(0), flex: 1 }}>Expense Name</Text>
                <Text style={{ ...hc(76, { right: true, noBorderRight: true }) }}>Total</Text>
              </View>

              {/* Row 1: Office Commission */}
              <View style={{ ...bRow, minHeight: 14 }}>
                <Text style={{ ...dc(20), textAlign: 'center' }}>1</Text>
                <Text style={{ ...dc(0, { bold: true }), flex: 1 }}>
                  Office Commission{commPct > 0 ? ` (${commPct}%)` : ''}
                </Text>
                <Text style={{ ...dc(76, { noBorderRight: true }), textAlign: 'right' }}>{fmt2(totalCommission)}</Text>
              </View>

              {/* Row 2: Advance Deduction */}
              <View style={{ ...bRow, minHeight: 14 }}>
                <Text style={{ ...dc(20), textAlign: 'center' }}>2</Text>
                <Text style={{ ...dc(0), flex: 1 }}>Advance Deduction</Text>
                <Text style={{ ...dc(76, { noBorderRight: true }), textAlign: 'right' }}>{fmt2(data.advance_principal_deduction)}</Text>
              </View>

              {/* Row 3: Advance Interest */}
              <View style={{ ...bRow, minHeight: 14 }}>
                <Text style={{ ...dc(20), textAlign: 'center' }}>3</Text>
                <Text style={{ ...dc(0), flex: 1 }}>Advance Interest ({interestPct}%/mo)</Text>
                <Text style={{ ...dc(76, { noBorderRight: true }), textAlign: 'right' }}>{fmt2(data.advance_interest_deduction)}</Text>
              </View>

              {/* Optional: other deductions */}
              {data.other_deductions > 0 && (
                <View style={{ ...bRow, minHeight: 14 }}>
                  <Text style={{ ...dc(20), textAlign: 'center' }}>4</Text>
                  <Text style={{ ...dc(0), flex: 1 }}>Other Deductions</Text>
                  <Text style={{ ...dc(76, { noBorderRight: true }), textAlign: 'right' }}>{fmt2(data.other_deductions)}</Text>
                </View>
              )}

              {/* Empty filler rows */}
              {[...Array(4)].map((_, i) => (
                <View key={i} style={{ ...bRow, minHeight: 14 }}>
                  <View style={{ width: 20, borderRightWidth: 0.5, borderRightColor: BK }} />
                  <View style={{ flex: 1, borderRightWidth: 0.5, borderRightColor: BK }} />
                  <View style={{ width: 76 }} />
                </View>
              ))}

              {/* TOTAL (Expenses Summary) */}
              <View style={{ ...bRow, backgroundColor: GR, borderTopWidth: 1, borderTopColor: BK }}>
                <Text style={dc(20, { bold: true, bg: GR })}></Text>
                <Text style={{ ...dc(0, { bold: true, bg: GR }), flex: 1 }}>TOTAL (Expenses Summary)</Text>
                <Text style={{ ...dc(76, { bold: true, bg: GR, noBorderRight: true }), textAlign: 'right' }}>{fmt2(totalDeductions)}</Text>
              </View>

              {/* Cash / Cheque & Accounts lines */}
              <View style={{ paddingHorizontal: 6, paddingTop: 5, paddingBottom: 2, borderTopWidth: 0.5, borderTopColor: BK }}>
                <Text>By Cash/Cheque No. _______________________________</Text>
              </View>
              <View style={{ paddingHorizontal: 6, paddingBottom: 5 }}>
                <Text>Accounts _______________________________________</Text>
              </View>
            </View>

            {/* ── RIGHT: Grand Total boxes ── */}
            <View style={{ width: 220 }}>
              {/* Hire Credit */}
              <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BK, minHeight: 18, alignItems: 'center' }}>
                <Text style={{ flex: 1, fontFamily: BOLD, fontSize: 7.5, paddingHorizontal: 6, borderRightWidth: 0.5, borderRightColor: BK, textAlign: 'right' }}>HIRE CREDIT</Text>
                <Text style={{ width: 88, fontFamily: BOLD, fontSize: 7.5, paddingHorizontal: 6, textAlign: 'right' }}>{fmt2(totalCredit)}</Text>
              </View>

              {/* Bata Earnings */}
              <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BK, minHeight: 18, alignItems: 'center' }}>
                <Text style={{ flex: 1, fontFamily: BOLD, fontSize: 7.5, paddingHorizontal: 6, borderRightWidth: 0.5, borderRightColor: BK, textAlign: 'right' }}>BATA EARNINGS</Text>
                <Text style={{ width: 88, fontFamily: BOLD, fontSize: 7.5, paddingHorizontal: 6, textAlign: 'right' }}>{fmt2(data.bata_earnings)}</Text>
              </View>

              {/* Toll, Parking & Permit breakdown */}
              {totalTollBreakdown.toll > 0 && (
                <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BK, minHeight: 15, alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontSize: 6.5, paddingHorizontal: 6, borderRightWidth: 0.5, borderRightColor: BK, textAlign: 'right' }}>  Toll</Text>
                  <Text style={{ width: 88, fontSize: 6.5, paddingHorizontal: 6, textAlign: 'right' }}>{fmt2(totalTollBreakdown.toll)}</Text>
                </View>
              )}
              {totalTollBreakdown.parking > 0 && (
                <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BK, minHeight: 15, alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontSize: 6.5, paddingHorizontal: 6, borderRightWidth: 0.5, borderRightColor: BK, textAlign: 'right' }}>  Parking</Text>
                  <Text style={{ width: 88, fontSize: 6.5, paddingHorizontal: 6, textAlign: 'right' }}>{fmt2(totalTollBreakdown.parking)}</Text>
                </View>
              )}
              {totalTollBreakdown.permit > 0 && (
                <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BK, minHeight: 15, alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontSize: 6.5, paddingHorizontal: 6, borderRightWidth: 0.5, borderRightColor: BK, textAlign: 'right' }}>  Permit</Text>
                  <Text style={{ width: 88, fontSize: 6.5, paddingHorizontal: 6, textAlign: 'right' }}>{fmt2(totalTollBreakdown.permit)}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BK, minHeight: 18, alignItems: 'center' }}>
                <Text style={{ flex: 1, fontFamily: BOLD, fontSize: 7.5, paddingHorizontal: 6, borderRightWidth: 0.5, borderRightColor: BK, textAlign: 'right' }}>TOLL, PARKING &amp; PERMIT</Text>
                <Text style={{ width: 88, fontFamily: BOLD, fontSize: 7.5, paddingHorizontal: 6, textAlign: 'right' }}>{fmt2(totalToll)}</Text>
              </View>

              {/* Salary (if salary driver) */}
              {data.salary_amount > 0 && (
                <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BK, minHeight: 18, alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontFamily: BOLD, fontSize: 7.5, paddingHorizontal: 6, borderRightWidth: 0.5, borderRightColor: BK, textAlign: 'right' }}>MONTHLY SALARY</Text>
                  <Text style={{ width: 88, fontFamily: BOLD, fontSize: 7.5, paddingHorizontal: 6, textAlign: 'right' }}>{fmt2(data.salary_amount)}</Text>
                </View>
              )}

              {/* Grand Total */}
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BK, minHeight: 22, alignItems: 'center', backgroundColor: GR }}>
                <Text style={{ flex: 1, fontFamily: BOLD, fontSize: 8.5, paddingHorizontal: 6, paddingVertical: 4, borderRightWidth: 0.5, borderRightColor: BK, textAlign: 'right' }}>GRAND TOTAL</Text>
                <Text style={{ width: 88, fontFamily: BOLD, fontSize: 8.5, paddingHorizontal: 6, paddingVertical: 4, textAlign: 'right' }}>{fmt2(grandTotal)}</Text>
              </View>

              {/* Deductions */}
              <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BK, minHeight: 22, alignItems: 'center' }}>
                <Text style={{ flex: 1, fontFamily: BOLD, fontSize: 8.5, paddingHorizontal: 6, paddingVertical: 4, borderRightWidth: 0.5, borderRightColor: BK, textAlign: 'right' }}>DEDUCTIONS</Text>
                <Text style={{ width: 88, fontFamily: BOLD, fontSize: 8.5, paddingHorizontal: 6, paddingVertical: 4, textAlign: 'right' }}>{fmt2(totalDeductions)}</Text>
              </View>

              {/* Balance */}
              <View style={{ flexDirection: 'row', minHeight: 26, alignItems: 'center', backgroundColor: GR, borderTopWidth: 1, borderTopColor: BK }}>
                <Text style={{ flex: 1, fontFamily: BOLD, fontSize: 9.5, paddingHorizontal: 6, paddingVertical: 5, borderRightWidth: 0.5, borderRightColor: BK, textAlign: 'right' }}>BALANCE</Text>
                <Text style={{ width: 88, fontFamily: BOLD, fontSize: 9.5, paddingHorizontal: 6, paddingVertical: 5, textAlign: 'right' }}>{fmt2(data.net_payable)}</Text>
              </View>
            </View>
          </View>

          {/* ── Signature row ── */}
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: BK, paddingVertical: 10 }}>
            <Text style={{ flex: 1, fontSize: 7, textAlign: 'center' }}>Proprietor</Text>
            <Text style={{ flex: 1, fontSize: 7, textAlign: 'center' }}>Manager</Text>
            <Text style={{ flex: 1, fontSize: 7, textAlign: 'center' }}>{"Receiver's Signature"}</Text>
          </View>

        </View>
      </Page>
    </Document>
  )
}
