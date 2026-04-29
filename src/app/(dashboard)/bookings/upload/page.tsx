'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface ParsedRow {
  guest_name?: string
  guest_phone?: string
  pickup_location?: string
  drop_location?: string
  pickup_date?: string
  pickup_time?: string
  pax_count?: string
  vehicle_type?: string
  special_instructions?: string
}

interface UploadResult {
  ref: string
  status: 'created' | 'error'
  error?: string
}

const REQUIRED_COLUMNS = ['pickup_location', 'pickup_date', 'pickup_time']
const ALL_COLUMNS = [
  'guest_name', 'guest_phone', 'pickup_location', 'drop_location',
  'pickup_date', 'pickup_time', 'pax_count', 'vehicle_type', 'special_instructions',
]

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
      const data = evt.target?.result
      const wb = XLSX.read(data, { type: 'binary', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { raw: false })

      const parsed = json.map(row => {
        const normalized: ParsedRow = {}
        for (const col of ALL_COLUMNS) {
          const val = row[col] || row[col.replace(/_/g, ' ')] || ''
          if (val) (normalized as Record<string, string>)[col] = String(val).trim()
        }
        return normalized
      }).filter(r => Object.keys(r).length > 0)

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

  const missingRequired = rows.some(r =>
    REQUIRED_COLUMNS.some(col => !r[col as keyof ParsedRow])
  )

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/bookings" className="inline-flex items-center gap-1 text-sm text-[#434654] hover:text-[#191B23] -ml-1 py-1.5 px-2 rounded hover:bg-[#EDEDF8] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Bookings
        </Link>
      </div>

      <PageHeader title="Bulk Upload" description="Import bookings from an Excel or CSV file" />

      {/* Template download info */}
      <div className="bg-[#F3F3FE] border border-[#C3C5D7] rounded-lg p-4 mb-5 text-sm text-[#434654]">
        <p className="font-medium text-[#191B23] mb-1">Expected columns (header row):</p>
        <code className="text-xs text-[#1A56DB]">{ALL_COLUMNS.join(', ')}</code>
        <p className="mt-1.5 text-xs">
          Required: <strong>pickup_location, pickup_date, pickup_time</strong> · Date format: YYYY-MM-DD · Time format: HH:MM
        </p>
      </div>

      {/* File picker */}
      <div
        className="border-2 border-dashed border-[#C3C5D7] rounded-lg p-8 text-center cursor-pointer hover:border-[#1A56DB] hover:bg-[#F3F3FE] transition-colors mb-5"
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
        <div className="bg-white border border-[#C3C5D7] rounded-lg overflow-hidden mb-5">
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#F3F3FE] border-b border-[#C3C5D7]">
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
                <tr className="border-b border-[#C3C5D7]">
                  {ALL_COLUMNS.map(col => (
                    <th key={col} className="text-left px-3 py-2 text-[#737686] font-medium whitespace-nowrap">
                      {col.replace(/_/g, ' ')}
                      {REQUIRED_COLUMNS.includes(col) && <span className="text-red-500 ml-0.5">*</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-b border-[#C3C5D7] last:border-0">
                    {ALL_COLUMNS.map(col => {
                      const val = row[col as keyof ParsedRow]
                      const missing = REQUIRED_COLUMNS.includes(col) && !val
                      return (
                        <td key={col} className={`px-3 py-2 ${missing ? 'bg-amber-50 text-amber-700' : 'text-[#191B23]'}`}>
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
        <div className="bg-white border border-[#C3C5D7] rounded-lg overflow-hidden mb-5">
          <div className="px-4 py-2.5 bg-[#F3F3FE] border-b border-[#C3C5D7]">
            <p className="text-sm font-medium text-[#191B23]">Upload Results</p>
          </div>
          <div className="divide-y divide-[#C3C5D7] max-h-60 overflow-y-auto">
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
