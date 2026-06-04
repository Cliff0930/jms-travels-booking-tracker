import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

const NAVY   = '#1e3a5f'
const RED    = '#C53030'
const BORDER = '#D0D5DD'
const TEXT   = '#1a1a1a'

const JMS = {
  name: 'J M S TRAVELS',
  tagline: 'we take pride in your ride',
  address: '#14/17, 15th Cross, Eshwar Layout, Indira Nagar, Bangalore-560038',
  phone: '+91 98455 72207',
  email: 'jmstravelprabhu@gmail.com',
  pan: 'AICPP7457N',
  gstin: '29AICPP7457N1ZF',
}

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 8, color: TEXT, paddingBottom: 24 },
  redStripe: { height: 5, backgroundColor: RED },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#FAFBFF' },
  logoImg: { width: 64, height: 64, objectFit: 'contain', marginRight: 12 },
  logoBox: { width: 64, height: 64, marginRight: 12 },
  headerLeft: { flex: 1 },
  companyName: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: 1.5 },
  tagline: { fontSize: 6, fontFamily: 'Helvetica-Oblique', color: '#777', marginTop: 1 },
  addr: { fontSize: 6, color: '#555', marginTop: 2 },
  badge: { backgroundColor: RED, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 3, alignItems: 'center' },
  badgeText: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 1.5 },
  badgeSub: { fontSize: 6, color: '#fca5a5', marginTop: 2, letterSpacing: 0.5 },
  divider: { height: 1, backgroundColor: NAVY },
  pad: { paddingHorizontal: 24 },

  infoRow: { flexDirection: 'row', marginTop: 10, marginBottom: 8 },
  clientBox: { flex: 1, paddingRight: 12, borderLeftWidth: 3, borderLeftColor: RED, paddingLeft: 8 },
  toLabel: { fontSize: 6, color: '#888', marginBottom: 2 },
  clientName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY },
  clientGstin: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: TEXT, marginTop: 1 },
  clientAddr: { fontSize: 6.5, color: '#555', marginTop: 1, lineHeight: 1.4 },
  infoGrid: { width: 220, borderWidth: 0.5, borderColor: BORDER, borderRadius: 2, overflow: 'hidden' },
  infoRowB: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER },
  infoRowL: { flexDirection: 'row' },
  infoKey: { width: 100, backgroundColor: '#EEF2F7', padding: '3 6', fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#555', borderRightWidth: 0.5, borderRightColor: BORDER },
  infoVal: { flex: 1, padding: '3 6', fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: NAVY },

  reasonBox: { borderWidth: 0.5, borderColor: '#FCA5A5', backgroundColor: '#FFF5F5', borderLeftWidth: 3, borderLeftColor: RED, padding: '6 10', marginBottom: 8, borderRadius: 2 },
  reasonLabel: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#9B1C1C', marginBottom: 2, letterSpacing: 0.5 },
  reasonText: { fontSize: 7.5, color: '#7F1D1D', fontFamily: 'Helvetica-Bold' },

  table: { borderWidth: 0.5, borderColor: BORDER, marginBottom: 8 },
  thead: { flexDirection: 'row', backgroundColor: RED },
  th: { padding: '4 6', fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff', borderRightWidth: 0.5, borderRightColor: '#E53E3E' },
  dataRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#EAECF0' },
  td: { padding: '4 6', fontSize: 7.5, borderRightWidth: 0.5, borderRightColor: '#EAECF0' },
  tdR: { textAlign: 'right' },
  totalRow: { flexDirection: 'row', backgroundColor: '#FFF5F5', borderTopWidth: 1.5, borderTopColor: RED },
  ttd: { padding: '4 6', fontSize: 7.5, fontFamily: 'Helvetica-Bold', borderRightWidth: 0.5, borderRightColor: BORDER },

  summaryRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 },
  summaryBox: { borderWidth: 1.5, borderColor: RED, backgroundColor: RED, padding: '8 16', borderRadius: 3, alignItems: 'flex-end' },
  sumLabel: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#FCA5A5', marginBottom: 4, letterSpacing: 0.8 },
  sumVal: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#fff' },

  notesBox: { borderWidth: 0.5, borderColor: BORDER, padding: '5 8', borderRadius: 2, marginBottom: 8 },
  notesLabel: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#888', marginBottom: 2 },
  notesText: { fontSize: 7, color: TEXT },

  footer: { paddingHorizontal: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  signBlock: { width: 130, alignItems: 'center' },
  signFor: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: TEXT, textAlign: 'center', marginBottom: 22 },
  signLine: { height: 0.5, backgroundColor: '#444', width: 130, marginBottom: 4 },
  signLbl: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: TEXT, textAlign: 'center' },
  disclaimer: { fontSize: 6, color: '#9CA3AF', maxWidth: 340, lineHeight: 1.5 },
})

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export interface CreditNotePDFData {
  logoSrc?: string
  cn_number: string
  created_at: string
  issued_at: string | null
  reason: string
  notes: string | null
  invoice_number: string | null
  company: { name: string; gstin?: string | null; address?: string | null } | null
  subtotal: number
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  total_amount: number
  line_items: {
    booking_ref: string | null
    description: string
    amount: number
    cgst_rate: number
    sgst_rate: number
    igst_rate: number
    cgst_amount: number
    sgst_amount: number
    igst_amount: number
    line_total: number
  }[]
}

export function CreditNotePDF(data: CreditNotePDFData) {
  const dateStr = fmtDate(data.issued_at ?? data.created_at)
  const useIgst = data.igst_amount > 0

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.redStripe} />

        {/* Header */}
        <View style={s.header}>
          {data.logoSrc
            ? <Image src={data.logoSrc} style={s.logoImg} />
            : <View style={s.logoBox} />
          }
          <View style={s.headerLeft}>
            <Text style={s.companyName}>{JMS.name}</Text>
            <Text style={s.tagline}>{JMS.tagline}</Text>
            <Text style={s.addr}>{JMS.address}</Text>
            <Text style={s.addr}>{JMS.phone} · {JMS.email}</Text>
            <Text style={s.addr}>GSTIN: {JMS.gstin}  PAN: {JMS.pan}</Text>
          </View>
          <View style={s.badge}>
            <Text style={s.badgeText}>CREDIT NOTE</Text>
            <Text style={s.badgeSub}>ORIGINAL FOR RECIPIENT</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* Client + CN Info */}
        <View style={[s.pad, s.infoRow]}>
          <View style={s.clientBox}>
            <Text style={s.toLabel}>CREDIT NOTE ISSUED TO</Text>
            <Text style={s.clientName}>{data.company?.name ?? 'Walk-in / Cash'}</Text>
            {data.company?.gstin && <Text style={s.clientGstin}>GSTIN: {data.company.gstin}</Text>}
            {data.company?.address && <Text style={s.clientAddr}>{data.company.address}</Text>}
          </View>
          <View style={s.infoGrid}>
            {[
              { k: 'Credit Note No.', v: data.cn_number },
              { k: 'Date', v: dateStr },
              { k: 'Against Invoice', v: data.invoice_number ?? '—' },
            ].map((row, i, arr) => (
              <View key={row.k} style={i < arr.length - 1 ? s.infoRowB : s.infoRowL}>
                <Text style={s.infoKey}>{row.k}</Text>
                <Text style={s.infoVal}>{row.v}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Reason */}
        <View style={[s.pad, { marginBottom: 8 }]}>
          <View style={s.reasonBox}>
            <Text style={s.reasonLabel}>REASON FOR CREDIT NOTE</Text>
            <Text style={s.reasonText}>{data.reason}</Text>
          </View>
        </View>

        {/* Line Items Table */}
        <View style={s.pad}>
          <View style={s.table}>
            <View style={s.thead}>
              <Text style={[s.th, { flex: 1 }]}>Description</Text>
              {data.line_items.some(li => li.booking_ref) && (
                <Text style={[s.th, { width: 80 }]}>Booking Ref</Text>
              )}
              <Text style={[s.th, { width: 68, textAlign: 'right' }]}>Net Amount</Text>
              {useIgst
                ? <Text style={[s.th, { width: 60, textAlign: 'right' }]}>IGST (5%)</Text>
                : <>
                    <Text style={[s.th, { width: 60, textAlign: 'right' }]}>CGST (2.5%)</Text>
                    <Text style={[s.th, { width: 60, textAlign: 'right' }]}>SGST (2.5%)</Text>
                  </>
              }
              <Text style={[s.th, { width: 72, textAlign: 'right', borderRightWidth: 0 }]}>Credit Total</Text>
            </View>

            {data.line_items.map((li, i) => (
              <View key={i} style={[s.dataRow, i % 2 === 1 ? { backgroundColor: '#FFF8F8' } : {}]}>
                <Text style={[s.td, { flex: 1 }]}>{li.description}</Text>
                {data.line_items.some(l => l.booking_ref) && (
                  <Text style={[s.td, { width: 80 }]}>{li.booking_ref ?? '—'}</Text>
                )}
                <Text style={[s.td, s.tdR, { width: 68 }]}>{fmt(li.amount)}</Text>
                {useIgst
                  ? <Text style={[s.td, s.tdR, { width: 60 }]}>{fmt(li.igst_amount)}</Text>
                  : <>
                      <Text style={[s.td, s.tdR, { width: 60 }]}>{fmt(li.cgst_amount)}</Text>
                      <Text style={[s.td, s.tdR, { width: 60 }]}>{fmt(li.sgst_amount)}</Text>
                    </>
                }
                <Text style={[s.td, s.tdR, { width: 72, borderRightWidth: 0, fontFamily: 'Helvetica-Bold' }]}>{fmt(li.line_total)}</Text>
              </View>
            ))}

            {/* Totals row */}
            <View style={s.totalRow}>
              <Text style={[s.ttd, { flex: 1 }]}>TOTAL</Text>
              {data.line_items.some(li => li.booking_ref) && <Text style={[s.ttd, { width: 80 }]} />}
              <Text style={[s.ttd, s.tdR, { width: 68 }]}>{fmt(data.subtotal)}</Text>
              {useIgst
                ? <Text style={[s.ttd, s.tdR, { width: 60 }]}>{fmt(data.igst_amount)}</Text>
                : <>
                    <Text style={[s.ttd, s.tdR, { width: 60 }]}>{fmt(data.cgst_amount)}</Text>
                    <Text style={[s.ttd, s.tdR, { width: 60 }]}>{fmt(data.sgst_amount)}</Text>
                  </>
              }
              <Text style={[s.ttd, s.tdR, { width: 72, borderRightWidth: 0, color: RED }]}>{fmt(data.total_amount)}</Text>
            </View>
          </View>

          {/* Total credit amount */}
          <View style={s.summaryRow}>
            <View style={s.summaryBox}>
              <Text style={s.sumLabel}>TOTAL CREDIT AMOUNT</Text>
              <Text style={s.sumVal}>{fmt(data.total_amount)}</Text>
            </View>
          </View>

          {/* Notes */}
          {data.notes && (
            <View style={s.notesBox}>
              <Text style={s.notesLabel}>NOTES</Text>
              <Text style={s.notesText}>{data.notes}</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.disclaimer}>
            This is a computer-generated credit note. This credit note reduces the amount payable
            against {data.invoice_number ? `invoice ${data.invoice_number}` : 'the referenced invoice'}.
          </Text>
          <View style={s.signBlock}>
            <Text style={s.signFor}>For {JMS.name}</Text>
            <View style={s.signLine} />
            <Text style={s.signLbl}>Authorised Signatory</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
