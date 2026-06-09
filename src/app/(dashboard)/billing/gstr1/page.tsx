'use client'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Download, Info } from 'lucide-react'
import * as XLSX from 'xlsx'

interface B2BRow {
  gstin_of_recipient: string; receiver_name: string; invoice_number: string
  invoice_date: string; invoice_value: number; place_of_supply: string
  reverse_charge: string; invoice_type: string; rate: number
  taxable_value: number; cgst_amount: number; sgst_amount: number; igst_amount: number; cess_amount: number
}
interface B2CSRow {
  type: string; place_of_supply: string; rate: number
  taxable_value: number; cgst_amount: number; sgst_amount: number; igst_amount: number; cess_amount: number
}
interface CDNRRow {
  gstin_of_recipient: string; receiver_name: string; cn_number: string; cn_date: string
  note_type: string; place_of_supply: string; reverse_charge: string
  original_invoice_number: string; invoice_value: number; rate: number
  taxable_value: number; cgst_amount: number; sgst_amount: number; igst_amount: number; cess_amount: number
}
interface HSNRow {
  sac_code: string; description: string; uqc: string; total_quantity: number; total_value: number
  taxable_value: number; rate: number; cgst_amount: number; sgst_amount: number; igst_amount: number; cess_amount: number
}
interface Summary {
  total_invoices: number; b2b_count: number; b2cs_count: number; cdnr_count: number
  total_taxable: number; total_cgst: number; total_sgst: number; total_igst: number; total_tax: number; gross_turnover: number
}
interface GSTR1Data { month: string; b2b: B2BRow[]; b2cs: B2CSRow[]; cdnr: CDNRRow[]; hsn: HSNRow[]; summary: Summary }

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman & Nicobar', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
}

export default function GSTR1Page() {
  const now = new Date()
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [activeTab, setActiveTab] = useState<'b2b' | 'b2cs' | 'cdnr' | 'hsn'>('b2b')

  const { data, isLoading } = useQuery<GSTR1Data>({
    queryKey: ['gstr1', month],
    queryFn: () => fetch(`/api/billing/gstr1?month=${month}`).then(r => r.json()),
    enabled: !!month,
  })

  const monthLabel = useMemo(() => {
    if (!month) return ''
    const [y, m] = month.split('-')
    return new Date(Number(y), Number(m) - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  }, [month])

  function exportExcel() {
    if (!data) return
    const wb = XLSX.utils.book_new()

    const b2bSheet = data.b2b.map(r => ({
      'GSTIN of Recipient': r.gstin_of_recipient,
      'Receiver Name':      r.receiver_name,
      'Invoice Number':     r.invoice_number,
      'Invoice Date':       r.invoice_date,
      'Invoice Value':      r.invoice_value,
      'Place Of Supply':    `${r.place_of_supply}-${STATE_CODES[r.place_of_supply] ?? ''}`,
      'Reverse Charge':     r.reverse_charge,
      'Invoice Type':       r.invoice_type,
      'E-Commerce GSTIN':   '',
      'Rate':               r.rate,
      'Taxable Value':      r.taxable_value,
      'Integrated Tax Amount': r.igst_amount,
      'Central Tax Amount':    r.cgst_amount,
      'State/UT Tax Amount':   r.sgst_amount,
      'Cess Amount':           r.cess_amount,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(b2bSheet), 'b2b')

    const b2csSheet = data.b2cs.map(r => ({
      'Type':               r.type,
      'Place Of Supply':    `${r.place_of_supply}-${STATE_CODES[r.place_of_supply] ?? ''}`,
      'Rate':               r.rate,
      'Taxable Value':      r.taxable_value,
      'Central Tax Amount':    r.cgst_amount,
      'State/UT Tax Amount':   r.sgst_amount,
      'Integrated Tax Amount': r.igst_amount,
      'Cess Amount':           r.cess_amount,
      'E-Commerce GSTIN':      '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(b2csSheet), 'b2cs')

    const cdnrSheet = data.cdnr.map(r => ({
      'GSTIN of Recipient':  r.gstin_of_recipient,
      'Receiver Name':       r.receiver_name,
      'Note Number':         r.cn_number,
      'Note Date':           r.cn_date,
      'Note Type':           'Credit Note',
      'Place Of Supply':     `${r.place_of_supply}-${STATE_CODES[r.place_of_supply] ?? ''}`,
      'Reverse Charge':      r.reverse_charge,
      'Note Value':          r.invoice_value,
      'Rate':                r.rate,
      'Taxable Value':       r.taxable_value,
      'Integrated Tax Amount': r.igst_amount,
      'Central Tax Amount':    r.cgst_amount,
      'State/UT Tax Amount':   r.sgst_amount,
      'Cess Amount':           r.cess_amount,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cdnrSheet), 'cdnr')

    const hsnSheet = data.hsn.map(r => ({
      'HSN/SAC':               r.sac_code,
      'Description':           r.description,
      'UQC':                   r.uqc,
      'Total Quantity':        r.total_quantity,
      'Total Value':           r.total_value,
      'Taxable Value':         r.taxable_value,
      'Integrated Tax Amount': r.igst_amount,
      'Central Tax Amount':    r.cgst_amount,
      'State/UT Tax Amount':   r.sgst_amount,
      'Cess Amount':           r.cess_amount,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hsnSheet), 'hsn')

    XLSX.writeFile(wb, `GSTR1-${month}.xlsx`)
  }

  const s = data?.summary
  const tabs = [
    { key: 'b2b',  label: `B2B (${data?.b2b.length ?? 0})` },
    { key: 'b2cs', label: `B2CS (${data?.b2cs.length ?? 0})` },
    { key: 'cdnr', label: `CDNR (${data?.cdnr.length ?? 0})` },
    { key: 'hsn',  label: 'HSN/SAC' },
  ] as const

  return (
    <div>
      <PageHeader
        title="GSTR-1"
        description="Outward supply return — B2B, B2CS, credit notes, HSN summary"
        actions={
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!data} className="gap-1.5">
            <Download className="w-4 h-4" /> Download GSTR-1 Excel
          </Button>
        }
      />

      {/* Month picker */}
      <div className="flex items-center gap-3 mb-5">
        <label className="text-sm font-medium text-[#434654]">Return Period</label>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="h-9 px-3 rounded-md border border-[#C3C5D7] text-sm text-[#191B23] bg-white focus:outline-none focus:ring-2 focus:ring-[#1A56DB]"
        />
        <span className="text-sm text-[#737686]">{monthLabel}</span>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 mb-5 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Download the Excel and upload to the <strong>GSTN Offline Utility</strong> (file → import). Place of supply defaults to <strong>29-Karnataka</strong>. Verify before filing.</span>
      </div>

      {/* Summary tiles */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Gross Turnover',    value: fmt(s.gross_turnover) },
            { label: 'Taxable Value',     value: fmt(s.total_taxable) },
            { label: 'Total GST',         value: fmt(s.total_tax) },
            { label: 'CGST+SGST / IGST', value: `${fmt(s.total_cgst + s.total_sgst)} / ${fmt(s.total_igst)}` },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-lg border border-[#E5E7EB] p-3">
              <p className="text-xs text-[#737686] mb-1">{c.label}</p>
              <p className="text-base font-semibold text-[#191B23]">{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-[#E5E7EB]">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? 'border-[#1A56DB] text-[#1A56DB]'
                : 'border-transparent text-[#737686] hover:text-[#191B23]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-[#737686]">Loading…</p>
      ) : (
        <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-x-auto">
          {activeTab === 'b2b' && (
            <table className="w-full text-xs">
              <thead className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                <tr>
                  {['GSTIN', 'Name', 'Invoice #', 'Date', 'Value', 'Rev.Chg', 'Rate%', 'Taxable', 'CGST', 'SGST', 'IGST'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-[#737686] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {(data?.b2b.length ?? 0) === 0 && (
                  <tr><td colSpan={11} className="px-3 py-6 text-center text-[#9CA3AF]">No B2B invoices for this period</td></tr>
                )}
                {data?.b2b.map((r, i) => (
                  <tr key={i} className="hover:bg-[#F9FAFB]">
                    <td className="px-3 py-2 font-mono text-[#434654]">{r.gstin_of_recipient}</td>
                    <td className="px-3 py-2 text-[#191B23] max-w-[160px] truncate">{r.receiver_name}</td>
                    <td className="px-3 py-2 text-[#434654]">{r.invoice_number}</td>
                    <td className="px-3 py-2 text-[#434654] whitespace-nowrap">{r.invoice_date}</td>
                    <td className="px-3 py-2 text-right text-[#191B23]">{fmt(r.invoice_value)}</td>
                    <td className="px-3 py-2 text-center">{r.reverse_charge}</td>
                    <td className="px-3 py-2 text-center">{r.rate}%</td>
                    <td className="px-3 py-2 text-right">{fmt(r.taxable_value)}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{fmt(r.cgst_amount)}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{fmt(r.sgst_amount)}</td>
                    <td className="px-3 py-2 text-right text-purple-700">{fmt(r.igst_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'b2cs' && (
            <table className="w-full text-xs">
              <thead className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                <tr>
                  {['Type', 'Place of Supply', 'Rate%', 'Taxable Value', 'CGST', 'SGST', 'IGST'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-[#737686]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {(data?.b2cs.length ?? 0) === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-[#9CA3AF]">No B2CS invoices for this period</td></tr>
                )}
                {data?.b2cs.map((r, i) => (
                  <tr key={i} className="hover:bg-[#F9FAFB]">
                    <td className="px-3 py-2">{r.type}</td>
                    <td className="px-3 py-2">{r.place_of_supply} — {STATE_CODES[r.place_of_supply]}</td>
                    <td className="px-3 py-2">{r.rate}%</td>
                    <td className="px-3 py-2 text-right">{fmt(r.taxable_value)}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{fmt(r.cgst_amount)}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{fmt(r.sgst_amount)}</td>
                    <td className="px-3 py-2 text-right text-purple-700">{fmt(r.igst_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'cdnr' && (
            <table className="w-full text-xs">
              <thead className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                <tr>
                  {['GSTIN', 'Name', 'CN Number', 'CN Date', 'Orig. Invoice', 'Value', 'Taxable', 'CGST', 'SGST', 'IGST'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-[#737686] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {(data?.cdnr.length ?? 0) === 0 && (
                  <tr><td colSpan={10} className="px-3 py-6 text-center text-[#9CA3AF]">No credit notes to registered recipients this period</td></tr>
                )}
                {data?.cdnr.map((r, i) => (
                  <tr key={i} className="hover:bg-[#F9FAFB]">
                    <td className="px-3 py-2 font-mono text-[#434654]">{r.gstin_of_recipient}</td>
                    <td className="px-3 py-2 text-[#191B23] max-w-[140px] truncate">{r.receiver_name}</td>
                    <td className="px-3 py-2">{r.cn_number}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.cn_date}</td>
                    <td className="px-3 py-2">{r.original_invoice_number}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.invoice_value)}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.taxable_value)}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{fmt(r.cgst_amount)}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{fmt(r.sgst_amount)}</td>
                    <td className="px-3 py-2 text-right text-purple-700">{fmt(r.igst_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'hsn' && (
            <table className="w-full text-xs">
              <thead className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                <tr>
                  {['SAC Code', 'Description', 'Qty', 'Total Value', 'Taxable Value', 'Rate', 'CGST', 'SGST', 'IGST'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-[#737686]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {data?.hsn.map((r, i) => (
                  <tr key={i} className="hover:bg-[#F9FAFB]">
                    <td className="px-3 py-2 font-mono">{r.sac_code}</td>
                    <td className="px-3 py-2 text-[#434654]">{r.description}</td>
                    <td className="px-3 py-2 text-right">{r.total_quantity}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.total_value)}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.taxable_value)}</td>
                    <td className="px-3 py-2 text-right">{r.rate}%</td>
                    <td className="px-3 py-2 text-right text-blue-700">{fmt(r.cgst_amount)}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{fmt(r.sgst_amount)}</td>
                    <td className="px-3 py-2 text-right text-purple-700">{fmt(r.igst_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
