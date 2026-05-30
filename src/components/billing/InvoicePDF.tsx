import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

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

// Column widths (landscape A4 = 842pt, 20pt margins = 802pt usable)
const W = {
  no: 38, date: 52, cabNo: 64, cabType: 76,
  kms: 28, hrs: 24,
  slab: 30, slabRate: 44,
  extHrs: 22, extHrRate: 30, extHrAmt: 42,
  extKms: 26, extKmRate: 30, extKmAmt: 42,
  bata: 42, parking: 46, permit: 32, total: 52,
}
// Sum ≈ 724pt — fits with room for cell padding

const NAVY = '#1e3a5f'
const NAVY_MID = '#2c5282'
const BORDER = '#bbbbbb'
const ROW_EVEN = '#f4f7fb'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 7,
    color: '#1a1a1a',
    paddingTop: 18,
    paddingBottom: 16,
    paddingLeft: 20,
    paddingRight: 20,
  },

  // ── Header ──────────────────────────────────────────────────────
  headerWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  logoBox: { width: 72, height: 72, marginRight: 12 },
  logo: { width: 72, height: 72, objectFit: 'contain' },
  headerText: { flex: 1, alignItems: 'center' },
  companyName: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: 2 },
  companyTagline: { fontSize: 6.5, fontFamily: 'Helvetica-Oblique', color: '#666', marginTop: 1 },
  addressLine: { fontSize: 6.5, color: '#444', marginTop: 2, textAlign: 'center' },
  hsnLine: { fontSize: 7, fontFamily: 'Helvetica-Bold', textDecoration: 'underline', marginTop: 3 },
  billTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginTop: 2 },
  headerSpacer: { width: 72 },

  divider: { height: 1.5, backgroundColor: NAVY, marginVertical: 5 },

  // ── Client + Invoice info row ───────────────────────────────────
  infoSection: { flexDirection: 'row', marginBottom: 6 },
  clientBlock: { flex: 1, paddingRight: 10 },
  toRow: { flexDirection: 'row', gap: 4, marginBottom: 1 },
  toLabel: { fontSize: 6.5, color: '#666' },
  clientName: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 2 },
  clientGstin: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#333', marginBottom: 1 },
  clientAddress: { fontSize: 6.5, color: '#444', lineHeight: 1.4 },

  infoGrid: { width: 240, borderWidth: 0.5, borderColor: BORDER },
  infoRowBorder: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER },
  infoRowLast: { flexDirection: 'row' },
  infoKey: {
    width: 100, backgroundColor: '#edf2f7', padding: '3 6',
    fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#555',
    borderRightWidth: 0.5, borderRightColor: BORDER,
  },
  infoVal: { flex: 1, padding: '3 6', fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: NAVY },

  // ── Trip Table ──────────────────────────────────────────────────
  table: { borderWidth: 0.5, borderColor: BORDER, marginBottom: 5 },

  groupRow: { flexDirection: 'row', backgroundColor: NAVY },
  groupCell: {
    padding: '3 2', textAlign: 'center', fontSize: 6,
    fontFamily: 'Helvetica-Bold', color: '#ffffff',
    borderRightWidth: 0.5, borderRightColor: NAVY_MID,
  },

  subRow: { flexDirection: 'row', backgroundColor: NAVY_MID },
  subCell: {
    padding: '2.5 2', textAlign: 'center', fontSize: 5.5,
    fontFamily: 'Helvetica-Bold', color: '#ffffff',
    borderRightWidth: 0.5, borderRightColor: '#3d6faa',
  },

  dataRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e5e5e5' },
  dc: { padding: '2.5 2', fontSize: 6.5, borderRightWidth: 0.5, borderRightColor: '#e5e5e5', overflow: 'hidden' },
  dcR: { textAlign: 'right' },
  dcC: { textAlign: 'center' },

  totalRow: {
    flexDirection: 'row',
    backgroundColor: '#e8edf5',
    borderTopWidth: 1.5, borderTopColor: NAVY,
  },
  totalCell: {
    padding: '3 2', fontSize: 7, fontFamily: 'Helvetica-Bold',
    borderRightWidth: 0.5, borderRightColor: '#bbb',
  },

  // ── Footer ──────────────────────────────────────────────────────
  rcmBox: {
    borderWidth: 0.5, borderColor: '#c53030',
    backgroundColor: '#fff5f5', padding: '4 8', marginBottom: 5,
  },
  rcmText: { fontSize: 6.5, color: '#c53030', fontFamily: 'Helvetica-Oblique', lineHeight: 1.5 },

  gstSummaryRow: { flexDirection: 'row', gap: 6, marginBottom: 5 },
  gstItem: {
    borderWidth: 0.5, borderColor: BORDER,
    backgroundColor: '#f7faff', padding: '4 10', alignItems: 'center',
  },
  gstLbl: { fontSize: 6, color: '#666', marginBottom: 2 },
  gstVal: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY },

  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  amtWordsBox: {
    flex: 1, borderWidth: 0.5, borderColor: BORDER,
    padding: '4 8', marginRight: 10,
  },
  amtWordsLbl: { fontSize: 6, color: '#888', marginBottom: 2, fontFamily: 'Helvetica-Bold' },
  amtWordsText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#1a1a1a', lineHeight: 1.4 },

  grandBox: {
    borderWidth: 1.5, borderColor: NAVY,
    backgroundColor: '#edf2f7', padding: '6 14',
    alignItems: 'flex-end',
  },
  grandLbl: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#555', marginBottom: 2 },
  grandVal: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: NAVY },

  bankSignRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6 },
  bankBox: { borderWidth: 0.5, borderColor: BORDER, padding: '4 8' },
  bankTitle: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 3 },
  bankLine: { fontSize: 6.5, color: '#333', marginBottom: 1 },

  signBox: { alignItems: 'flex-end' },
  signFor: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#444', marginBottom: 24 },
  signLine: { height: 0.5, backgroundColor: '#333', width: 110, marginBottom: 3 },
  signLbl: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#1a1a1a', textAlign: 'center', width: 110 },
})

// ── Interfaces ────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────

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

function numToWords(n: number): string {
  const ones = ['','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE',
    'TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN']
  const tensArr = ['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY']
  function t(x: number) { return x < 20 ? ones[x] : tensArr[Math.floor(x/10)] + (x%10 ? ' ' + ones[x%10] : '') }
  function h(x: number) { return x >= 100 ? ones[Math.floor(x/100)] + ' HUNDRED' + (x%100 ? ' AND ' + t(x%100) : '') : t(x) }
  const int = Math.round(n)
  if (!int) return 'ZERO ONLY'
  const crore = Math.floor(int/10000000)
  const lakh  = Math.floor((int%10000000)/100000)
  const thou  = Math.floor((int%100000)/1000)
  const rest  = int%1000
  const parts: string[] = []
  if (crore) parts.push(h(crore) + ' CRORE')
  if (lakh)  parts.push(t(lakh) + ' LAKH')
  if (thou)  parts.push(t(thou) + ' THOUSAND')
  if (rest)  parts.push(h(rest))
  return parts.join(' ') + ' ONLY'
}

// ── Table headers (repeats on every page) ────────────────────────

function TableHeader() {
  const gW = W.no + W.date + W.cabNo + W.cabType + W.kms + W.hrs
  const aW = W.slab + W.slabRate
  const bW = W.extHrs + W.extHrRate + W.extHrAmt
  const cW = W.extKms + W.extKmRate + W.extKmAmt
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
        <Text style={[s.subCell, { width: W.no }]}>Trip No.</Text>
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

// ── Main PDF Component ────────────────────────────────────────────

export function InvoicePDF({ data }: { data: InvoicePDFData }) {
  const preGstTotals = data.line_items.map(li =>
    n(li.hire_charges) + n(li.toll_amount) + n(li.parking_amount) + n(li.permit_amount) + (li.bill_bata ? n(li.bata_amount) : 0)
  )
  const tableTotal = preGstTotals.reduce((acc, v) => acc + v, 0)

  const spanAll = W.no+W.date+W.cabNo+W.cabType+W.kms+W.hrs+W.slab+W.slabRate+W.extHrs+W.extHrRate+W.extHrAmt+W.extKms+W.extKmRate+W.extKmAmt+W.bata+W.parking+W.permit

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>

        {/* ── Company Header ── */}
        <View style={s.headerWrap}>
          {/* Logo left — balanced by spacer on right so text stays centred */}
          {data.logoSrc
            ? <Image src={data.logoSrc} style={s.logo} />
            : <View style={s.logoBox} />
          }
          <View style={s.headerText}>
            <Text style={s.companyName}>{JMS.name}</Text>
            <Text style={s.companyTagline}>{JMS.tagline}</Text>
            <Text style={s.addressLine}>{JMS.address}</Text>
            <Text style={s.addressLine}>Ph: {JMS.phone}   e-Mail: {JMS.email}</Text>
            <Text style={s.hsnLine}>H.S.N. CODE: {JMS.hsn}</Text>
            <Text style={s.billTitle}>CASH / CREDIT BILL</Text>
          </View>
          <View style={s.headerSpacer} />
        </View>

        <View style={s.divider} />

        {/* ── Client + Invoice details ── */}
        <View style={s.infoSection}>
          <View style={s.clientBlock}>
            <View style={s.toRow}>
              <Text style={s.toLabel}>TO</Text>
              <Text style={s.toLabel}>M/s</Text>
            </View>
            <Text style={s.clientName}>{data.company.name}</Text>
            {data.company.gstin ? <Text style={s.clientGstin}>GSTIN: {data.company.gstin}</Text> : null}
            {data.company.address ? <Text style={s.clientAddress}>{data.company.address}</Text> : null}
          </View>

          <View style={s.infoGrid}>
            <View style={s.infoRowBorder}>
              <Text style={s.infoKey}>Bill No.</Text>
              <Text style={s.infoVal}>{data.invoice_number}</Text>
            </View>
            <View style={s.infoRowBorder}>
              <Text style={s.infoKey}>Date</Text>
              <Text style={s.infoVal}>{fmtDateLong(data.created_at)}</Text>
            </View>
            <View style={s.infoRowBorder}>
              <Text style={s.infoKey}>Bill Dated Between</Text>
              <Text style={s.infoVal}>{fmtDateLong(data.period_from)} To {fmtDateLong(data.period_to)}</Text>
            </View>
            <View style={s.infoRowBorder}>
              <Text style={s.infoKey}>Our PAN No.</Text>
              <Text style={s.infoVal}>{JMS.pan}</Text>
            </View>
            <View style={s.infoRowLast}>
              <Text style={s.infoKey}>Our GSTIN</Text>
              <Text style={s.infoVal}>{JMS.gstin}</Text>
            </View>
          </View>
        </View>

        {/* ── Trip Table ── */}
        <View style={s.table}>
          <TableHeader />

          {data.line_items.map((li, i) => (
            <View key={i} style={[s.dataRow, i % 2 === 1 ? { backgroundColor: ROW_EVEN } : {}]}>
              <Text style={[s.dc, s.dcC, { width: W.no }]}>{li.tripsheet_number ?? li.booking_ref}</Text>
              <Text style={[s.dc, { width: W.date }]}>{fmtDateShort(li.trip_date)}</Text>
              <Text style={[s.dc, { width: W.cabNo }]}>{li.vehicle_number ?? '—'}</Text>
              <Text style={[s.dc, { width: W.cabType }]}>{li.vehicle_type ?? '—'}</Text>
              <Text style={[s.dc, s.dcR, { width: W.kms }]}>{n(li.actual_kms).toFixed(0)}</Text>
              <Text style={[s.dc, s.dcR, { width: W.hrs }]}>{n(li.actual_hrs).toFixed(0)}</Text>
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

          {/* Totals row */}
          <View style={s.totalRow}>
            <Text style={[s.totalCell, { width: spanAll, textAlign: 'right' }]}>NOTE:   TOTAL</Text>
            <Text style={[s.totalCell, { width: W.total, textAlign: 'right', borderRightWidth: 0 }]}>{fmt(tableTotal)}</Text>
          </View>
        </View>

        {/* ── Footer ── */}

        {/* RCM note OR GST breakdown */}
        {data.reverse_charge ? (
          <View style={s.rcmBox}>
            <Text style={s.rcmText}>
              As we come under Reverse Charge Mechanism. (Notification No: 22/2019 of central tax (Rate) Dated 30.09.2019){'\n'}
              Entire GST 5% amount will be paid by service receiver M/s. {data.company.name}
            </Text>
          </View>
        ) : (
          <View style={s.gstSummaryRow}>
            <View style={s.gstItem}>
              <Text style={s.gstLbl}>Hire Charges</Text>
              <Text style={s.gstVal}>Rs. {fmt(data.subtotal)}</Text>
            </View>
            {n(data.cgst_amount) > 0 && (
              <>
                <View style={s.gstItem}>
                  <Text style={s.gstLbl}>CGST @ 2.5%</Text>
                  <Text style={s.gstVal}>Rs. {fmt(data.cgst_amount)}</Text>
                </View>
                <View style={s.gstItem}>
                  <Text style={s.gstLbl}>SGST @ 2.5%</Text>
                  <Text style={s.gstVal}>Rs. {fmt(data.sgst_amount)}</Text>
                </View>
              </>
            )}
            {n(data.igst_amount) > 0 && (
              <View style={s.gstItem}>
                <Text style={s.gstLbl}>IGST @ 5%</Text>
                <Text style={s.gstVal}>Rs. {fmt(data.igst_amount)}</Text>
              </View>
            )}
            {n(data.tds_amount) > 0 && (
              <View style={[s.gstItem, { borderColor: '#c53030' }]}>
                <Text style={[s.gstLbl, { color: '#c53030' }]}>TDS Deducted</Text>
                <Text style={[s.gstVal, { color: '#c53030' }]}>- Rs. {fmt(data.tds_amount)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Amount in words + Grand Total */}
        <View style={s.bottomRow}>
          <View style={s.amtWordsBox}>
            <Text style={s.amtWordsLbl}>RUPEES</Text>
            <Text style={s.amtWordsText}>{numToWords(data.grand_total)}</Text>
          </View>
          <View style={s.grandBox}>
            <Text style={s.grandLbl}>INVOICE AMOUNT</Text>
            <Text style={s.grandVal}>Rs. {fmt(data.grand_total)}</Text>
          </View>
        </View>

        {/* Bank + Signature */}
        <View style={s.bankSignRow}>
          <View style={s.bankBox}>
            <Text style={s.bankTitle}>Bank Details</Text>
            <Text style={s.bankLine}>{JMS.bankName}</Text>
            <Text style={s.bankLine}>{JMS.bankBranch}</Text>
            <Text style={s.bankLine}>A/C No: {JMS.bankAccount}   IFSC: {JMS.bankIfsc}</Text>
          </View>
          <View style={s.signBox}>
            <Text style={s.signFor}>For {JMS.name}</Text>
            <View style={s.signLine} />
            <Text style={s.signLbl}>Authorised Signatory</Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}
