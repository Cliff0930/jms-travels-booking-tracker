'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, FileX } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CreditNote {
  id: string
  cn_number: string | null
  status: string
  reason: string
  total_amount: number
  created_at: string
  issued_at: string | null
  company?: { name: string } | null
  invoice?: { invoice_number: string | null } | null
}

const STATUS_COLORS: Record<string, string> = {
  draft:  'bg-gray-100 text-gray-600',
  issued: 'bg-red-50 text-red-700',
  voided: 'bg-gray-100 text-gray-400',
}

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CreditNotesPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const { data: notes = [], isLoading } = useQuery<CreditNote[]>({
    queryKey: ['credit-notes'],
    queryFn: () => fetch('/api/billing/credit-notes').then(r => r.json()),
  })

  const filtered = notes.filter(cn => {
    if (statusFilter !== 'all' && cn.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        cn.cn_number?.toLowerCase().includes(q) ||
        cn.company?.name?.toLowerCase().includes(q) ||
        cn.invoice?.invoice_number?.toLowerCase().includes(q) ||
        cn.reason.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div>
      <PageHeader title="Credit Notes" description="Credit notes issued against invoices" />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Select value={statusFilter} onValueChange={v => v !== null && setStatusFilter(v)}>
          <SelectTrigger className="w-36 h-9 border-[#C3C5D7] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#737686]" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search CN#, company, invoice…"
            className="pl-9 border-[#C3C5D7] h-9 text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <FileX className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No credit notes found</p>
          <p className="text-gray-300 text-xs mt-1">Issue a credit note from an invoice detail page</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['CN Number', 'Status', 'Company', 'Against Invoice', 'Reason', 'Credit Amount', 'Date'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(cn => (
                <tr
                  key={cn.id}
                  onClick={() => router.push(`/billing/credit-notes/${cn.id}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-semibold text-red-700">
                    {cn.cn_number ?? <span className="text-gray-400 italic font-normal">DRAFT</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-semibold capitalize',
                      STATUS_COLORS[cn.status] ?? 'bg-gray-100 text-gray-600'
                    )}>
                      {cn.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-700">{cn.company?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-blue-700 font-medium">{cn.invoice?.invoice_number ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{cn.reason}</td>
                  <td className="px-4 py-3 font-bold text-red-700">{fmt(cn.total_amount)}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(cn.issued_at ?? cn.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
