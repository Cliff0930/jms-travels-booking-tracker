'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, ArrowLeft, Download } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface ParsedRow {
  guest_name?: string
  guest_phone?: string
  company_name?: string
  booking_type?: string
  trip_type?: string
  total_days?: string
  pickup_location?: string
  drop_location?: string
  pickup_date?: string
  pickup_time?: string
  vehicle_type?: string
  pax_count?: string
  special_instructions?: string
}

interface UploadResult {
  ref: string
  status: 'created' | 'error'
  error?: string
}

// Column definitions: key, display label, required, allowed values / hint
const COLUMNS: {
  key: keyof ParsedRow
  label: string
  required?: boolean
  hint?: string
}[] = [
  { key: 'guest_name',          label: 'Guest Name',           hint: 'Traveller full name' },
  { key: 'guest_phone',         label: 'Guest Phone',          hint: '91XXXXXXXXXX' },
  { key: 'company_name',        label: 'Company Name',         hint: 'Must match a company in the system' },
  { key: 'booking_type',        label: 'Booking Type',         hint: 'company / personal' },
  { key: 'trip_type',           label: 'Trip Type',            hint: 'local / outstation / airport' },
  { key: 'total_days',          label: 'Total Days',           hint: 'Number (required for outstation)' },
  { key: 'pickup_location',     label: 'Pickup Location',      required: true },
  { key: 'drop_location',       label: 'Drop Location',        hint: 'Required for outstation & airport' },
  { key: 'pickup_date',         label: 'Pickup Date',          required: true, hint: 'YYYY-MM-DD' },
  { key: 'pickup_time',         label: 'Pickup Time',          required: true, hint: 'HH:MM (24hr)' },
  { key: 'vehicle_type',        label: 'Vehicle Type',         hint: 'Sedan / SUV / MUV / Van / Tempo / Bus / Luxury' },
  { key: 'pax_count',           label: 'Pax Count',            hint: 'Number of passengers' },
  { key: 'special_instructions',label: 'Special Instructions', hint: 'Notes for driver' },
]

const REQUIRED_KEYS = COLUMNS.filter(c => c.required).map(c => c.key)
const ALL_KEYS = COLUMNS.map(c => c.key)

const SAMPLE_ROWS = [
  {
    guest_name: 'Rajesh Kumar',
    guest_phone: '919876543210',
    company_name: '',
    booking_type: 'personal',
    trip_type: 'local',
    total_days: '1',
    pickup_location: 'Koramangala, Bangalore',
    drop_location: 'Whitefield, Bangalore',
    pickup_date: '2026-05-12',
    pickup_time: '09:00',
    vehicle_type: 'Sedan',
    pax_count: '1',
    special_instructions: 'Please be on time',
  },
  {
    guest_name: 'Priya Sharma',
    guest_phone: '919845123456',
    company_name: 'Infosys',
    booking_type: 'company',
    trip_type: 'outstation',
    total_days: '3',
    pickup_location: 'Indiranagar, Bangalore',
    drop_location: 'Mysore',
    pickup_date: '2026-05-14',
    pickup_time: '07:00',
    vehicle_type: 'SUV',
    pax_count: '2',
    special_instructions: 'AC must be working',
  },
  {
    guest_name: 'Amit Patel',
    guest_phone: '919980012345',
    company_name: 'TCS',
    booking_type: 'company',
    trip_type: 'airport',
    total_days: '1',
    pickup_location: 'JP Nagar, Bangalore',
    drop_location: 'Kempegowda International Airport',
    pickup_date: '2026-05-15',
    pickup_time: '04:30',
    vehicle_type: 'Sedan',
    pax_count: '1',
    special_instructions: 'Flight at 7am — must arrive by 5:30am',
  },
]

function downloadSample() {
  const headers = COLUMNS.map(c => c.key)
  const hints   = COLUMNS.map(c => c.hint ?? '')

  const ws = XLSX.utils.aoa_to_sheet([
    headers,
    hints,
    ...SAMPLE_ROWS.map(r => headers.map(h => r[h as keyof typeof r] ?? '')),
  ])

  // Style: widen columns
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 18) }))

  // Mark hint row lightly (row index 1 = row 2 in Excel)
  for (let c = 0; c < headers.length; c++) {
    const cell = XLSX.utils.encode_cell({ r: 1, c })
    if (ws[cell]) ws[cell].s = { font: { italic: true, color: { rgb: '888888' } } }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Bookings')
  XLSX.writeFile(wb, 'jms-bulk-booking-template.xlsx')
}

export default function BulkUploadPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<UploadResult[] | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResults(null)

    const reader = new FileReader()
    reader.onload = evt => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { raw: false })

      const parsed = json
        .map(row => {
          // Skip hint rows (cells that exactly match hint text)
          const normalized: ParsedRow = {}
          for (const col of ALL_KEYS) {
            const val = row[col] || row[col.replace(/_/g, ' ')] || ''
            if (val) (normalized as Record<string, string>)[col] = String(val).trim()
          }
          return normalized
        })
        .filter(r => {
          // Skip rows that look like the hints row (no pickup_location and no guest_name number-like values)
          const hasData = REQUIRED_KEYS.some(k => r[k]) || r.guest_name || r.guest_phone
          return hasData && Object.keys(r).length > 0
        })

      setRows(parsed)
    }
    reader.readAsBinaryString(file)
  }

  async function handleUpload() {
    if (rows.length === 0) return
    setLoading(true)
    try {
      const res = await fetch('/api/bookings/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json()
      setResults(data.results)
      toast.success(`${data.created} of ${data.total} bookings created`)
    } catch {
      toast.error('Upload failed')
    } finally {
      setLoading(false)
    }
  }

  const missingRequired = rows.some(r => REQUIRED_KEYS.some(k => !r[k]))

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/bookings" className="inline-flex items-center gap-1 text-sm text-[#434654] hover:text-[#191B23] -ml-1 py-1.5 px-2 rounded hover:bg-[#EDEDF8] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Bookings
        </Link>
      </div>

      <PageHeader
        title="Bulk Upload"
        description="Import bookings from an Excel or CSV file"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={downloadSample}
            className="gap-1.5 rounded-sm text-[#1A56DB] border-[#1A56DB] hover:bg-[#EEF2FF]"
          >
            <Download className="w-4 h-4" /> Download Sample
          </Button>
        }
      />

      {/* Column reference */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 mb-5">
        <p className="text-xs font-bold uppercase tracking-wide text-[#737686] mb-3">Column Reference</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {COLUMNS.map(col => (
            <div key={col.key} className="flex items-start gap-2">
              <code className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ${col.required ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-[#F3F3FE] text-[#1A56DB]'}`}>
                {col.key}
                {col.required && <span className="ml-0.5 text-red-500">*</span>}
              </code>
              {col.hint && <span className="text-xs text-[#737686] pt-0.5">{col.hint}</span>}
            </div>
          ))}
        </div>
        <p className="text-xs text-[#737686] mt-3">
          <span className="text-red-600 font-medium">* Required.</span> Date format: <code className="bg-[#F3F3FE] px-1">YYYY-MM-DD</code> · Time format: <code className="bg-[#F3F3FE] px-1">HH:MM</code> (24-hour)
        </p>
      </div>

      {/* File picker */}
      <div
        className="border-2 border-dashed border-[#C3C5D7] rounded-xl p-8 text-center cursor-pointer hover:border-[#1A56DB] hover:bg-[#F3F3FE] transition-colors mb-5"
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
        <FileSpreadsheet className="w-10 h-10 text-[#737686] mx-auto mb-3" />
        {fileName ? (
          <p className="font-medium text-[#191B23]">{fileName}</p>
        ) : (
          <>
            <p className="font-medium text-[#191B23]">Click to choose a file</p>
            <p className="text-xs text-[#737686] mt-1">.xlsx, .xls, or .csv</p>
          </>
        )}
      </div>

      {/* Preview table */}
      {rows.length > 0 && (
        <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden mb-5">
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#F9FAFB] border-b border-[#E5E7EB]">
            <p className="text-sm font-medium text-[#191B23]">{rows.length} rows parsed</p>
            {missingRequired && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Some rows are missing required fields — they will be flagged
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                  {COLUMNS.map(col => (
                    <th key={col.key} className="text-left px-3 py-2 text-[#737686] font-medium whitespace-nowrap">
                      {col.label}
                      {col.required && <span className="text-red-500 ml-0.5">*</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-b border-[#E5E7EB] last:border-0">
                    {COLUMNS.map(col => {
                      const val = row[col.key]
                      const missing = col.required && !val
                      return (
                        <td key={col.key} className={`px-3 py-2 ${missing ? 'bg-amber-50 text-amber-700' : 'text-[#191B23]'}`}>
                          {val || (missing ? '—' : '')}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 20 && (
            <p className="text-xs text-[#737686] px-4 py-2">… and {rows.length - 20} more rows</p>
          )}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden mb-5">
          <div className="px-4 py-2.5 bg-[#F9FAFB] border-b border-[#E5E7EB]">
            <p className="text-sm font-medium text-[#191B23]">Upload Results</p>
          </div>
          <div className="divide-y divide-[#E5E7EB] max-h-60 overflow-y-auto">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                {r.status === 'created'
                  ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  : <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                }
                <span className="text-sm font-medium text-[#191B23]">{r.ref}</span>
                {r.error && <span className="text-xs text-red-600">{r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        {results ? (
          <Button className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm" onClick={() => router.push('/bookings')}>
            View Bookings
          </Button>
        ) : (
          <Button
            className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm gap-1.5"
            onClick={handleUpload}
            disabled={rows.length === 0 || loading}
          >
            <Upload className="w-4 h-4" />
            {loading ? `Uploading ${rows.length} rows…` : `Upload ${rows.length} Booking${rows.length !== 1 ? 's' : ''}`}
          </Button>
        )}
        <Button variant="outline" className="rounded-sm" onClick={() => router.push('/bookings')}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
