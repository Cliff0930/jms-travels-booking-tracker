import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

const NAVY  = '#1e3a5f'
const TEAL  = '#00897B'
const BORDER = '#D0D5DD'
const ALT   = '#F4F7FC'
const TEXT  = '#1a1a1a'
const GREEN = '#166534'

const JMS = {
  name: 'J M S TRAVELS',
  tagline: 'we take pride in your ride',
  address: '#14/17, 15th Cross, Eshwar Layout, Indira Nagar, Bangalore-560038',
  phone: '+91 98455 72207 / 809540 3101 / 9480 165 207',
  email: 'jmstravelprabhu@gmail.com',
  pan: 'AICPP7457N',
  gstin: '29AICPP7457N1ZF',
  hsn: '996601',
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '0.00'
  return Number(n).toFixed(2)
}
function fmtDateShort(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateLong(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}
function n(v: number | null | undefined): number { return Number(v ?? 0) }
function slabLabel(pkg: string, kms: number): string {
  if (pkg === 'OUTSTATION') return 'OUTST'
  return `${pkg}/${kms}`
}

const W = {
  no: 44, date: 56, cabNo: 68, cabType: 84,
  kms: 32, hrs: 26,
  slab: 36, slabRate: 46,
  extHrs: 24, extHrRate: 32, extHrAmt: 44,
  extKms: 28, extKmRate: 32, extKmAmt: 44,
  bata: 48, parking: 50, total: 60,
}

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 7, color: TEXT, paddingBottom: 18, paddingLeft: 0, paddingRight: 0 },
  tealStripe: { height: 4, backgroundColor: TEAL },
  navyStripe: { height: 2, backgroundColor: NAVY, marginTop: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#FAFBFF' },
  logoImg: { width: 68, height: 68, objectFit: 'contain' },
  logoBox: { width: 68, height: 68 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  companyName: { fontSize: 19, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: 2 },
  taglineText: { fontSize: 6, fontFamily: 'Helvetica-Oblique', color: '#777', marginTop: 1 },
  addrLine: { fontSize: 6.5, color: '#555', marginTop: 2, textAlign: 'center' },
  hsnText: { fontSize: 6, color: '#888', marginTop: 1.5, textAlign: 'center' },
  billBadge: { backgroundColor: GREEN, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 },
  billBadgeText: { color: 'white', fontSize: 9, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5 },
  pad: { paddingHorizontal: 20 },
  infoSection: { flexDirection: 'row', gap: 16, marginTop: 10 },
  clientBox: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 8 },
  toLine: { fontSize: 6.5, color: '#888', fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  clientName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },
  clientGstin: { fontSize: 7, color: '#555', marginTop: 2 },
  clientAddr: { fontSize: 7, color: '#777', marginTop: 1 },
  notGstNote: { fontSize: 7, color: GREEN, fontFamily: 'Helvetica-Bold', marginTop: 4, backgroundColor: '#f0fdf4', padding: 3, borderRadius: 2 },
  infoGrid: { flex: 1, gap: 0 },
  infoRowB: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#F0F0F0', paddingVertical: 4 },
  infoRowL: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  infoKey: { fontSize: 7, color: '#666' },
  infoVal: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: TEXT },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 4, overflow: 'hidden', marginTop: 10 },
  headerRow2: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 5 },
  th: { fontSize: 6, color: 'white', fontFamily: 'Helvetica-Bold', paddingHorizontal: 3 },
  thR: { textAlign: 'right' },
  thC: { textAlign: 'center' },
  dataRow: { flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderColor: '#F0F0F0' },
  dc: { fontSize: 6.5, paddingHorizontal: 3, color: TEXT },
  dcR: { textAlign: 'right' },
  dcC: { textAlign: 'center' },
  totalRow: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 5 },
  totalLabel: { flex: 1, fontSize: 7, color: 'white', fontFamily: 'Helvetica-Bold', paddingLeft: 8 },
  totalAmt: { fontSize: 7, color: 'white', fontFamily: 'Helvetica-Bold', paddingRight: 8 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderColor: BORDER },
  footerL: { flex: 1 },
  footerR: { alignItems: 'flex-end' },
  footerLabel: { fontSize: 7, color: '#555' },
  footerVal: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: TEXT, marginTop: 1 },
  signLine: { width: 120, borderBottomWidth: 1, borderColor: '#666', marginBottom: 2, marginTop: 16 },
  signText: { fontSize: 6.5, color: '#666' },
  payBadge: { backgroundColor: '#16a34a', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3 },
  payBadgeText: { color: 'white', fontSize: 7, fontFamily: 'Helvetica-Bold' },
})

export interface CashReceiptPDFData {
  logoSrc?: string
  bill_number: string | null
  period_from: string
  period_to: string
  created_at: string
  client_name: string
  client_phone?: string | null
  payment_mode?: string | null
  status: string
  subtotal: number
  total: number
  notes?: string | null
  line_items: CashReceiptLineItem[]
}

export interface CashReceiptLineItem {
  booking_ref: string
  tripsheet_number: string | null
  trip_date: string | null
  vehicle_number: string | null
  vehicle_type: string | null
  trip_type: string | null
  actual_kms: number
  actual_hrs: number
  package_type: string
  package_kms: number
  package_rate: number
  extra_kms: number; extra_km_rate: number; extra_km_amount: number
  extra_hrs: number; extra_hr_rate: number; extra_hr_amount: number
  hire_charges: number
  toll_amount: number; parking_amount: number; permit_amount: number
  bata_amount: number
  line_total: number
  pickup_location: string | null
  drop_location: string | null
}

const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
}

function TableHeader() {
  const spanAll = Object.values(W).reduce((a, b) => a + b, 0)
  return (
    <View style={s.headerRow2}>
      <Text style={[s.th, s.thC, { width: W.no }]}>TS#</Text>
      <Text style={[s.th, { width: W.date }]}>Date</Text>
      <Text style={[s.th, { width: W.cabNo }]}>Cab No</Text>
      <Text style={[s.th, { width: W.cabType }]}>Cab Type</Text>
      <Text style={[s.th, s.thR, { width: W.kms }]}>KMs</Text>
      <Text style={[s.th, s.thR, { width: W.hrs }]}>Hrs</Text>
      <Text style={[s.th, s.thC, { width: W.slab }]}>Slab</Text>
      <Text style={[s.th, s.thR, { width: W.slabRate }]}>Rate</Text>
      <Text style={[s.th, s.thR, { width: W.extHrs }]}>EH</Text>
      <Text style={[s.th, s.thR, { width: W.extHrRate }]}>EHR</Text>
      <Text style={[s.th, s.thR, { width: W.extHrAmt }]}>EH Amt</Text>
      <Text style={[s.th, s.thR, { width: W.extKms }]}>EK</Text>
      <Text style={[s.th, s.thR, { width: W.extKmRate }]}>EKR</Text>
      <Text style={[s.th, s.thR, { width: W.extKmAmt }]}>EK Amt</Text>
      <Text style={[s.th, s.thR, { width: W.bata }]}>Bata</Text>
      <Text style={[s.th, s.thR, { width: W.parking }]}>Pkg+Toll</Text>
      <Text style={[s.th, s.thR, { width: spanAll - Object.values(W).slice(0, -1).reduce((a, b) => a + b, 0) }]}>Total</Text>
    </View>
  )
}

export function CashReceiptPDF({ data }: { data: CashReceiptPDFData }) {
  const spanAll = Object.values(W).reduce((a, b) => a + b, 0)
  const grandTotal = data.total
  const words = toWordsINR(grandTotal)

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.tealStripe} />

        {/* Header */}
        <View style={s.headerRow}>
          {data.logoSrc
            ? <Image style={s.logoImg} src={data.logoSrc} />
            : <View style={s.logoBox} />}
          <View style={s.headerCenter}>
            <Text style={s.companyName}>{JMS.name}</Text>
            <Text style={s.taglineText}>{JMS.tagline}</Text>
            <Text style={s.addrLine}>{JMS.address}</Text>
            <Text style={s.addrLine}>Ph: {JMS.phone}   e-Mail: {JMS.email}</Text>
            <Text style={s.hsnText}>H.S.N. CODE: {JMS.hsn}</Text>
          </View>
          <View style={s.billBadge}>
            <Text style={s.billBadgeText}>CASH BILL</Text>
          </View>
        </View>
        <View style={s.navyStripe} />

        {/* Client + Bill Info */}
        <View style={s.pad}>
          <View style={s.infoSection}>
            <View style={s.clientBox}>
              <Text style={s.toLine}>TO</Text>
              <Text style={s.clientName}>{data.client_name}</Text>
              {data.client_phone && <Text style={s.clientAddr}>Ph: {data.client_phone}</Text>}
              <Text style={s.notGstNote}>This is NOT a GST Tax Invoice</Text>
            </View>
            <View style={s.infoGrid}>
              <View style={s.infoRowB}>
                <Text style={s.infoKey}>Bill No.</Text>
                <Text style={s.infoVal}>{data.bill_number ?? 'DRAFT'}</Text>
              </View>
              <View style={s.infoRowB}>
                <Text style={s.infoKey}>Date</Text>
                <Text style={s.infoVal}>{fmtDateLong(data.created_at)}</Text>
              </View>
              <View style={s.infoRowB}>
                <Text style={s.infoKey}>Period</Text>
                <Text style={s.infoVal}>{fmtDateShort(data.period_from)} — {fmtDateShort(data.period_to)}</Text>
              </View>
              <View style={s.infoRowB}>
                <Text style={s.infoKey}>Payment</Text>
                <Text style={s.infoVal}>{PAYMENT_MODE_LABELS[data.payment_mode ?? ''] ?? (data.payment_mode ?? 'Cash')}</Text>
              </View>
              <View style={s.infoRowL}>
                <Text style={s.infoKey}>Status</Text>
                <Text style={[s.infoVal, { color: data.status === 'paid' ? '#16a34a' : data.status === 'issued' ? '#1d4ed8' : '#6b7280' }]}>
                  {data.status.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Trip Table */}
        <View style={[s.pad, { marginTop: 6 }]}>
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
                <Text style={[s.dc, s.dcR, { width: W.extHrRate }]}>{fmt(li.extra_hr_rate)}</Text>
                <Text style={[s.dc, s.dcR, { width: W.extHrAmt }]}>{n(li.extra_hr_amount) > 0 ? fmt(li.extra_hr_amount) : '—'}</Text>
                <Text style={[s.dc, s.dcR, { width: W.extKms }]}>{n(li.extra_kms) > 0 ? n(li.extra_kms).toFixed(0) : '0'}</Text>
                <Text style={[s.dc, s.dcR, { width: W.extKmRate }]}>{fmt(li.extra_km_rate)}</Text>
                <Text style={[s.dc, s.dcR, { width: W.extKmAmt }]}>{n(li.extra_km_amount) > 0 ? fmt(li.extra_km_amount) : '—'}</Text>
                <Text style={[s.dc, s.dcR, { width: W.bata }]}>{n(li.bata_amount) > 0 ? fmt(li.bata_amount) : '—'}</Text>
                <Text style={[s.dc, s.dcR, { width: W.parking }]}>{(n(li.toll_amount) + n(li.parking_amount)) > 0 ? fmt(n(li.toll_amount) + n(li.parking_amount)) : '—'}</Text>
                <Text style={[s.dc, s.dcR, { width: spanAll - Object.values(W).slice(0, -1).reduce((a, b) => a + b, 0) }]}>{fmt(li.line_total)}</Text>
              </View>
            ))}
            {/* Total row */}
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>TOTAL</Text>
              <Text style={s.totalAmt}>Rs. {fmt(grandTotal)}</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={[s.pad, s.footer]}>
          <View style={s.footerL}>
            <Text style={s.footerLabel}>Amount in words:</Text>
            <Text style={s.footerVal}>{words}</Text>
            {data.notes && <Text style={[s.footerLabel, { marginTop: 4 }]}>Note: {data.notes}</Text>}
          </View>
          <View style={s.footerR}>
            <View style={s.signLine} />
            <Text style={s.signText}>Authorised Signatory</Text>
            <Text style={[s.signText, { fontFamily: 'Helvetica-Bold', marginTop: 2 }]}>{JMS.name}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

// Indian number words helper (reused from InvoicePDF pattern)
function toWordsINR(amount: number): string {
  const whole = Math.floor(amount)
  const paise = Math.round((amount - whole) * 100)
  const words = numberToWords(whole)
  if (paise > 0) return `Rupees ${words} and ${numberToWords(paise)} Paise Only`
  return `Rupees ${words} Only`
}

function numberToWords(n: number): string {
  if (n === 0) return 'Zero'
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  function convert(num: number): string {
    if (num < 20) return ones[num]
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + ones[num % 10] : '')
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 !== 0 ? ' ' + convert(num % 100) : '')
    if (num < 100000) return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 !== 0 ? ' ' + convert(num % 1000) : '')
    if (num < 10000000) return convert(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 !== 0 ? ' ' + convert(num % 100000) : '')
    return convert(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 !== 0 ? ' ' + convert(num % 10000000) : '')
  }
  return convert(n)
}
