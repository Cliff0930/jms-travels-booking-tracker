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
  phone: '+91 98455 72207 / 809540 3101 / 9480 165 207',
  email: 'jmstravelprabhu@gmail.com',
  pan: 'AICPP7457N',
  gstin: '29AICPP7457N1ZF',
  hsn: '996601',
  bankName: 'Union Bank of India',
  bankBranch: 'HAL II Stage Branch, Bangalore - 560008',
  bankAccount: '510101003089915',
  bankIfsc: 'UBIN0903981',
}

// Column widths — landscape A4 (842pt), 20pt margins = 802pt usable
// Total = 788pt, leaving ~14pt natural right padding
const W = {
  no: 44, date: 56, cabNo: 68, cabType: 84,
  kms: 32, hrs: 26,
  slab: 32, slabRate: 46,
  extHrs: 24, extHrRate: 32, extHrAmt: 44,
  extKms: 28, extKmRate: 32, extKmAmt: 44,
  bata: 48, parking: 50, permit: 34, total: 60,
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 7,
    color: TEXT,
    paddingTop: 0,
    paddingBottom: 18,
    paddingLeft: 0,
    paddingRight: 0,
  },

  // ── Header ────────────────────────────────────────────────────────────
  tealStripe: { height: 4, backgroundColor: TEAL },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#FAFBFF',
  },
  logoImg: { width: 68, height: 68, objectFit: 'contain' },
  logoBox: { width: 68, height: 68 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  companyName: { fontSize: 19, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: 2 },
  taglineText: { fontSize: 6, fontFamily: 'Helvetica-Oblique', color: '#777', marginTop: 1 },
  addrLine: { fontSize: 6.5, color: '#555', marginTop: 2, textAlign: 'center' },
  hsnText: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: NAVY, textDecoration: 'underline', marginTop: 2 },
  billBadge: {
    width: 86, backgroundColor: NAVY,
    paddingVertical: 8, paddingHorizontal: 6,
    alignItems: 'center', borderRadius: 3,
  },
  billBadgeText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff', textAlign: 'center', lineHeight: 1.6 },
  navyStripe: { height: 1.5, backgroundColor: NAVY },

  // ── Content pad ───────────────────────────────────────────────────────
  pad: { paddingHorizontal: 20 },

  // ── Client + Invoice Info ─────────────────────────────────────────────
  infoSection: { flexDirection: 'row', marginTop: 8, marginBottom: 8 },
  clientBox: {
    flex: 1, paddingRight: 10,
    borderLeftWidth: 3, borderLeftColor: TEAL, paddingLeft: 8,
  },
  toLine: { fontSize: 6, color: '#888', marginBottom: 1 },
  clientName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 2 },
  clientGstin: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: TEXT, marginBottom: 1 },
  clientAddr: { fontSize: 6.5, color: '#555', lineHeight: 1.4 },

  infoGrid: { width: 248, borderWidth: 0.5, borderColor: BORDER, borderRadius: 2, overflow: 'hidden' },
  infoRowB: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER },
  infoRowL: { flexDirection: 'row' },
  infoKey: {
    width: 110, backgroundColor: '#EEF2F7',
    padding: '3.5 6',
    fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#555',
    borderRightWidth: 0.5, borderRightColor: BORDER,
  },
  infoVal: { flex: 1, padding: '3.5 6', fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: NAVY },

  // ── Table ─────────────────────────────────────────────────────────────
  table: { borderWidth: 0.5, borderColor: BORDER, marginBottom: 5 },

  groupRow: { flexDirection: 'row', backgroundColor: NAVY },
  groupCell: {
    padding: '3.5 2', textAlign: 'center',
    fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff',
    borderRightWidth: 0.5, borderRightColor: '#2d5080',
  },

  subRow: { flexDirection: 'row', backgroundColor: '#2c5282' },
  subCell: {
    padding: '3 2', textAlign: 'center',
    fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#cce0ff',
    borderRightWidth: 0.5, borderRightColor: '#3d6faa',
  },

  dataRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#EAECF0' },
  dc: { padding: '3.5 2', fontSize: 8, borderRightWidth: 0.5, borderRightColor: '#EAECF0', overflow: 'hidden' },
  dcR: { textAlign: 'right' },
  dcC: { textAlign: 'center' },

  // Total row — NOTE: on LEFT, TOTAL on RIGHT
  totalRow: {
    flexDirection: 'row',
    backgroundColor: '#EEF2F7',
    borderTopWidth: 2, borderTopColor: NAVY,
  },
  tcL: { padding: '3.5 6', fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#777', borderRightWidth: 0.5, borderRightColor: BORDER },
  tcM: { padding: '3.5 6', fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'right', borderRightWidth: 0.5, borderRightColor: BORDER },
  tcR: { padding: '3.5 6', fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'right', color: NAVY, borderRightWidth: 0 },

  // ── Footer ────────────────────────────────────────────────────────────
  rcmBox: {
    borderWidth: 0.5, borderColor: '#E53E3E',
    backgroundColor: '#FFF5F5',
    padding: '5 8', marginBottom: 6, borderRadius: 2,
    borderLeftWidth: 3, borderLeftColor: '#E53E3E',
  },
  rcmText: { fontSize: 6.5, color: '#C53030', fontFamily: 'Helvetica-Oblique', lineHeight: 1.6 },

  gstRow: { flexDirection: 'row', marginBottom: 6 },
  gstCard: {
    borderWidth: 0.5, borderColor: BORDER,
    backgroundColor: '#F9FAFB', padding: '4 10',
    alignItems: 'center', borderRadius: 2, marginRight: 6,
    borderTopWidth: 2, borderTopColor: TEAL,
  },
  gstLbl: { fontSize: 6, color: '#888', marginBottom: 2 },
  gstVal: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY },

  bottomRow: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 8 },
  amtBox: {
    flex: 1, borderWidth: 0.5, borderColor: BORDER,
    padding: '5 8', borderRadius: 2, marginRight: 8,
    borderLeftWidth: 3, borderLeftColor: TEAL,
  },
  amtLbl: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#888', marginBottom: 3, letterSpacing: 0.5 },
  amtText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: TEXT, lineHeight: 1.5 },

  grandBox: {
    borderWidth: 1.5, borderColor: NAVY,
    backgroundColor: NAVY,
    padding: '8 16', alignItems: 'flex-end',
    borderRadius: 3, justifyContent: 'center',
  },
  grandLbl: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#8ab4d8', marginBottom: 4, letterSpacing: 0.8 },
  grandVal: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#fff' },

  bankSignRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  bankBox: {
    borderWidth: 0.5, borderColor: BORDER,
    padding: '5 8', borderRadius: 2,
    borderLeftWidth: 3, borderLeftColor: NAVY,
  },
  bankTitle: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 },
  bankLine: { fontSize: 6.5, color: '#444', marginBottom: 2 },

  // Signature — both texts center-aligned inside a fixed-width block
  signBlock: { width: 130, alignItems: 'center' },
  signFor: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: TEXT, textAlign: 'center', marginBottom: 22 },
  signLine: { height: 0.5, backgroundColor: '#444', width: 130, marginBottom: 4 },
  signLbl: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: TEXT, textAlign: 'center' },
})

// ── Interfaces ────────────────────────────────────────────────────────────

export interface InvoicePDFData {
  logoSrc?: string
  invoice_number: string
  period_from: string
  period_to: string
  created_at: string
  reverse_charge: boolean
  company: { name: string; gstin?: string | null; address?: string | null }
  subtotal: number
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  tds_amount: number
  grand_total: number
  line_items: InvoicePDFLineItem[]
}

export interface InvoicePDFLineItem {
  booking_ref: string
  tripsheet_number: string | null
  trip_date: string | null
  vehicle_number: string | null
  vehicle_type: string | null
  actual_kms: number
  actual_hrs: number
  package_type: string
  package_kms: number
  package_rate: number
  extra_hrs: number
  extra_hr_rate: number
  extra_hr_amount: number
  extra_kms: number
  extra_km_rate: number
  extra_km_amount: number
  hire_charges: number
  toll_amount: number
  parking_amount: number
  permit_amount: number
  bata_amount: number
  bill_bata: boolean
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  line_total: number
}

// ── Helpers ───────────────────────────────────────────────────────────────

function n(v: number | null | undefined) { return Number(v ?? 0) }

function fmt(v: number | null | undefined): string {
  const num = n(v)
  if (num === 0) return '0.00'
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDateLong(d: string): string {
  try {
    const [y, m, dy] = d.slice(0, 10).split('-').map(Number)
    return new Date(y, m - 1, dy).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return d }
}

function fmtDateShort(d: string | null): string {
  if (!d) return '—'
  try {
    const [y, m, dy] = d.slice(0, 10).split('-').map(Number)
    return `${String(dy).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
  } catch { return d }
}

function slabLabel(packageType: string, packageKms: number): string {
  if (packageType === 'OUTSTATION') return 'OUTN'
  const hrs = packageType === '8HR' ? 8 : 4
  return `${hrs}\\${Math.round(packageKms || 0)}`
}

function numToWords(num: number): string {
  const ones = ['','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE',
    'TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN']
  const tensW = ['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY']
  function t(x: number) { return x < 20 ? ones[x] : tensW[Math.floor(x/10)] + (x%10 ? ' '+ones[x%10] : '') }
  function h(x: number) { return x >= 100 ? ones[Math.floor(x/100)]+' HUNDRED'+(x%100 ? ' AND '+t(x%100) : '') : t(x) }
  const int = Math.round(num)
  if (!int) return 'ZERO ONLY'
  const crore = Math.floor(int/10000000)
  const lakh  = Math.floor((int%10000000)/100000)
  const thou  = Math.floor((int%100000)/1000)
  const rest  = int%1000
  const p: string[] = []
  if (crore) p.push(h(crore)+' CRORE')
  if (lakh)  p.push(t(lakh)+' LAKH')
  if (thou)  p.push(t(thou)+' THOUSAND')
  if (rest)  p.push(h(rest))
  return p.join(' ') + ' ONLY'
}

// ── Table column headers (repeats on every page via fixed) ────────────────

function TableHeader() {
  const gW = W.no+W.date+W.cabNo+W.cabType+W.kms+W.hrs
  const aW = W.slab+W.slabRate
  const bW = W.extHrs+W.extHrRate+W.extHrAmt
  const cW = W.extKms+W.extKmRate+W.extKmAmt
  return (
    <>
      <View style={s.groupRow} fixed>
        <Text style={[s.groupCell, { width: gW }]}>Trip Particulars</Text>
        <Text style={[s.groupCell, { width: aW }]}>(A) Basic Slab</Text>
        <Text style={[s.groupCell, { width: bW }]}>(B) Extra Hours</Text>
        <Text style={[s.groupCell, { width: cW }]}>(C) Extra Kms</Text>
        <Text style={[s.groupCell, { width: W.bata }]}>(D)</Text>
        <Text style={[s.groupCell, { width: W.parking }]}>Parking</Text>
        <Text style={[s.groupCell, { width: W.permit }]}>Permit</Text>
        <Text style={[s.groupCell, { width: W.total, borderRightWidth: 0 }]}>Total Trip</Text>
      </View>
      <View style={s.subRow} fixed>
        <Text style={[s.subCell, { width: W.no }]}>TS#</Text>
        <Text style={[s.subCell, { width: W.date }]}>Date</Text>
        <Text style={[s.subCell, { width: W.cabNo }]}>Cab No.</Text>
        <Text style={[s.subCell, { width: W.cabType }]}>Cab Type</Text>
        <Text style={[s.subCell, { width: W.kms }]}>Kms</Text>
        <Text style={[s.subCell, { width: W.hrs }]}>Hrs</Text>
        <Text style={[s.subCell, { width: W.slab }]}>Slab</Text>
        <Text style={[s.subCell, { width: W.slabRate }]}>Rate</Text>
        <Text style={[s.subCell, { width: W.extHrs }]}>Hrs</Text>
        <Text style={[s.subCell, { width: W.extHrRate }]}>Rate</Text>
        <Text style={[s.subCell, { width: W.extHrAmt }]}>Amt</Text>
        <Text style={[s.subCell, { width: W.extKms }]}>Kms</Text>
        <Text style={[s.subCell, { width: W.extKmRate }]}>Rate</Text>
        <Text style={[s.subCell, { width: W.extKmAmt }]}>Amt</Text>
        <Text style={[s.subCell, { width: W.bata }]}>Driver Bata</Text>
        <Text style={[s.subCell, { width: W.parking }]}>Parking/Toll</Text>
        <Text style={[s.subCell, { width: W.permit }]}>Permit</Text>
        <Text style={[s.subCell, { width: W.total, borderRightWidth: 0 }]}>Amt</Text>
      </View>
    </>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

export function InvoicePDF({ data }: { data: InvoicePDFData }) {
  const preGstTotals = data.line_items.map(li =>
    n(li.hire_charges) + n(li.toll_amount) + n(li.parking_amount) + n(li.permit_amount) + n(li.bata_amount)
  )
  const tableTotal = preGstTotals.reduce((acc, v) => acc + v, 0)

  const spanAll = W.no+W.date+W.cabNo+W.cabType+W.kms+W.hrs+W.slab+W.slabRate+W.extHrs+W.extHrRate+W.extHrAmt+W.extKms+W.extKmRate+W.extKmAmt+W.bata+W.parking+W.permit
  const NOTE_W = 90

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>

        {/* ── HEADER — fixed so it repeats on every page ── */}
        <View fixed>
          <View style={s.tealStripe} />
          <View style={s.headerRow}>
            {data.logoSrc
              ? <Image src={data.logoSrc} style={s.logoImg} />
              : <View style={s.logoBox} />
            }
            <View style={s.headerCenter}>
              <Text style={s.companyName}>{JMS.name}</Text>
              <Text style={s.taglineText}>{JMS.tagline}</Text>
              <Text style={s.addrLine}>{JMS.address}</Text>
              <Text style={s.addrLine}>Ph: {JMS.phone}   e-Mail: {JMS.email}</Text>
              <Text style={s.hsnText}>H.S.N. CODE: {JMS.hsn}</Text>
            </View>
            <View style={s.billBadge}>
              <Text style={s.billBadgeText}>INVOICE</Text>
            </View>
          </View>
          <View style={s.navyStripe} />
        </View>

        {/* ── CLIENT + INVOICE INFO ── */}
        <View style={s.pad}>
          <View style={s.infoSection}>
            <View style={s.clientBox}>
              <Text style={s.toLine}>TO   M/s</Text>
              <Text style={s.clientName}>{data.company.name}</Text>
              {data.company.gstin ? <Text style={s.clientGstin}>GSTIN: {data.company.gstin}</Text> : null}
              {data.company.address ? <Text style={s.clientAddr}>{data.company.address}</Text> : null}
            </View>

            <View style={s.infoGrid}>
              <View style={s.infoRowB}>
                <Text style={s.infoKey}>Bill No.</Text>
                <Text style={s.infoVal}>{data.invoice_number}</Text>
              </View>
              <View style={s.infoRowB}>
                <Text style={s.infoKey}>Date</Text>
                <Text style={s.infoVal}>{fmtDateLong(data.created_at)}</Text>
              </View>
              <View style={s.infoRowB}>
                <Text style={s.infoKey}>Bill Dated Between</Text>
                <Text style={s.infoVal}>{fmtDateLong(data.period_from)} To {fmtDateLong(data.period_to)}</Text>
              </View>
              <View style={s.infoRowB}>
                <Text style={s.infoKey}>Our PAN No.</Text>
                <Text style={s.infoVal}>{JMS.pan}</Text>
              </View>
              <View style={s.infoRowL}>
                <Text style={s.infoKey}>Our GSTIN</Text>
                <Text style={s.infoVal}>{JMS.gstin}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── TRIP TABLE ── */}
        <View style={s.pad}>
          <View style={s.table}>
            <TableHeader />

            {data.line_items.map((li, i) => (
              <View key={i} style={[s.dataRow, i % 2 === 1 ? { backgroundColor: ALT } : {}]}>
                <Text style={[s.dc, s.dcC, { width: W.no }]}>{li.tripsheet_number ?? li.booking_ref}</Text>
                <Text style={[s.dc,        { width: W.date }]}>{fmtDateShort(li.trip_date)}</Text>
                <Text style={[s.dc,        { width: W.cabNo }]}>{li.vehicle_number ?? '—'}</Text>
                <Text style={[s.dc,        { width: W.cabType }]}>{li.vehicle_type ?? '—'}</Text>
                <Text style={[s.dc, s.dcR, { width: W.kms }]}>{n(li.actual_kms).toFixed(0)}</Text>
                <Text style={[s.dc, s.dcR, { width: W.hrs }]}>{li.trip_type === 'outstation' ? `${n(li.actual_hrs).toFixed(0)}D` : n(li.actual_hrs).toFixed(0)}</Text>
                <Text style={[s.dc, s.dcC, { width: W.slab }]}>{slabLabel(li.package_type, li.package_kms)}</Text>
                <Text style={[s.dc, s.dcR, { width: W.slabRate }]}>{fmt(li.package_rate)}</Text>
                <Text style={[s.dc, s.dcR, { width: W.extHrs }]}>{n(li.extra_hrs) > 0 ? n(li.extra_hrs).toFixed(0) : '0'}</Text>
                <Text style={[s.dc, s.dcR, { width: W.extHrRate }]}>{n(li.extra_hr_rate).toFixed(0)}</Text>
                <Text style={[s.dc, s.dcR, { width: W.extHrAmt }]}>{n(li.extra_hr_amount) > 0 ? fmt(li.extra_hr_amount) : '—'}</Text>
                <Text style={[s.dc, s.dcR, { width: W.extKms }]}>{n(li.extra_kms) > 0 ? n(li.extra_kms).toFixed(0) : '0'}</Text>
                <Text style={[s.dc, s.dcR, { width: W.extKmRate }]}>{n(li.extra_km_rate).toFixed(0)}</Text>
                <Text style={[s.dc, s.dcR, { width: W.extKmAmt }]}>{n(li.extra_km_amount) > 0 ? fmt(li.extra_km_amount) : '—'}</Text>
                <Text style={[s.dc, s.dcR, { width: W.bata }]}>{n(li.bata_amount) > 0 ? fmt(li.bata_amount) : '—'}</Text>
                <Text style={[s.dc, s.dcR, { width: W.parking }]}>{(n(li.toll_amount)+n(li.parking_amount)) > 0 ? fmt(n(li.toll_amount)+n(li.parking_amount)) : '—'}</Text>
                <Text style={[s.dc, s.dcR, { width: W.permit }]}>{n(li.permit_amount) > 0 ? fmt(li.permit_amount) : '—'}</Text>
                <Text style={[s.dc, s.dcR, { width: W.total, borderRightWidth: 0 }]}>{fmt(preGstTotals[i])}</Text>
              </View>
            ))}

            {/* Total row: NOTE: on far LEFT — TOTAL + amount on RIGHT */}
            <View style={s.totalRow}>
              <Text style={[s.tcL, { width: NOTE_W }]}>NOTE:</Text>
              <Text style={[s.tcM, { width: spanAll - NOTE_W }]}>TOTAL</Text>
              <Text style={[s.tcR, { width: W.total }]}>{fmt(tableTotal)}</Text>
            </View>
          </View>
        </View>

        {/* ── FOOTER ── */}
        <View style={s.pad}>

          {/* RCM note OR GST breakdown */}
          {data.reverse_charge ? (
            <View style={s.rcmBox}>
              <Text style={s.rcmText}>
                As we come under Reverse Charge Mechanism. (Notification No: 22/2019 of central tax (Rate) Dated 30.09.2019){'\n'}
                Entire GST 5% amount will be paid by service receiver M/s. {data.company.name}
              </Text>
            </View>
          ) : (
            <View style={s.gstRow}>
              <View style={s.gstCard}>
                <Text style={s.gstLbl}>Hire Charges</Text>
                <Text style={s.gstVal}>Rs. {fmt(data.subtotal)}</Text>
              </View>
              {n(data.cgst_amount) > 0 && (
                <>
                  <View style={s.gstCard}>
                    <Text style={s.gstLbl}>CGST @ 2.5%</Text>
                    <Text style={s.gstVal}>Rs. {fmt(data.cgst_amount)}</Text>
                  </View>
                  <View style={s.gstCard}>
                    <Text style={s.gstLbl}>SGST @ 2.5%</Text>
                    <Text style={s.gstVal}>Rs. {fmt(data.sgst_amount)}</Text>
                  </View>
                </>
              )}
              {n(data.igst_amount) > 0 && (
                <View style={s.gstCard}>
                  <Text style={s.gstLbl}>IGST @ 5%</Text>
                  <Text style={s.gstVal}>Rs. {fmt(data.igst_amount)}</Text>
                </View>
              )}
              {n(data.tds_amount) > 0 && (
                <View style={[s.gstCard, { borderTopColor: '#E53E3E' }]}>
                  <Text style={[s.gstLbl, { color: '#E53E3E' }]}>TDS Deducted</Text>
                  <Text style={[s.gstVal, { color: '#E53E3E' }]}>- Rs. {fmt(data.tds_amount)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Calculation breakdown + Grand total */}
          <View style={s.bottomRow}>
            <View style={s.amtBox}>
              <Text style={s.amtLbl}>RUPEES</Text>
              <Text style={s.amtText}>{numToWords(data.grand_total)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {/* Calculation breakdown */}
              <View style={{ marginBottom: 4, alignItems: 'flex-end' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: 200, marginBottom: 2 }}>
                  <Text style={{ fontSize: 7, color: '#555' }}>Trip Total (Hire + Bata + Extras)</Text>
                  <Text style={{ fontSize: 7, color: '#555' }}>Rs. {fmt(tableTotal)}</Text>
                </View>
                {n(data.cgst_amount) > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: 200, marginBottom: 2 }}>
                    <Text style={{ fontSize: 7, color: '#555' }}>CGST @ 2.5%</Text>
                    <Text style={{ fontSize: 7, color: '#555' }}>Rs. {fmt(data.cgst_amount)}</Text>
                  </View>
                )}
                {n(data.sgst_amount) > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: 200, marginBottom: 2 }}>
                    <Text style={{ fontSize: 7, color: '#555' }}>SGST @ 2.5%</Text>
                    <Text style={{ fontSize: 7, color: '#555' }}>Rs. {fmt(data.sgst_amount)}</Text>
                  </View>
                )}
                {n(data.igst_amount) > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: 200, marginBottom: 2 }}>
                    <Text style={{ fontSize: 7, color: '#555' }}>IGST @ 5%</Text>
                    <Text style={{ fontSize: 7, color: '#555' }}>Rs. {fmt(data.igst_amount)}</Text>
                  </View>
                )}
                <View style={{ width: 200, borderTopWidth: 0.5, borderTopColor: NAVY, marginTop: 2 }} />
              </View>
              <View style={s.grandBox}>
                <Text style={s.grandLbl}>INVOICE AMOUNT</Text>
                <Text style={s.grandVal}>Rs. {fmt(data.grand_total)}</Text>
              </View>
            </View>
          </View>

          {/* Bank details + Signature */}
          <View style={s.bankSignRow}>
            <View style={s.bankBox}>
              <Text style={s.bankTitle}>Bank Details</Text>
              <Text style={s.bankLine}>{JMS.bankName}</Text>
              <Text style={s.bankLine}>{JMS.bankBranch}</Text>
              <Text style={s.bankLine}>A/C No: {JMS.bankAccount}   IFSC: {JMS.bankIfsc}</Text>
            </View>

            {/* Signature block — both lines centered inside fixed 130pt container */}
            <View style={s.signBlock}>
              <Text style={s.signFor}>For {JMS.name}</Text>
              <View style={s.signLine} />
              <Text style={s.signLbl}>Authorised Signatory</Text>
            </View>
          </View>

        </View>
      </Page>
    </Document>
  )
}
