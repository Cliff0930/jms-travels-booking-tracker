'use client'
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Download, Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const CATEGORIES = [
  'Fuel', 'Driver Salary', 'Vehicle Maintenance', 'Insurance', 'Toll',
  'Parking', 'Office Supplies', 'Software / Subscription', 'Travel', 'Utilities',
  'Professional Fees', 'Marketing', 'Miscellaneous',
]

const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Credit Card']

interface Expense {
  id: string
  date: string
  category: string
  description: string | null
  amount: number
  payment_mode: string
  vendor: string | null
  reference: string | null
  created_at: string
}

interface ExpenseForm {
  date: string
  category: string
  description: string
  amount: string
  payment_mode: string
  vendor: string
  reference: string
}

const emptyForm: ExpenseForm = {
  date: new Date().toISOString().slice(0, 10),
  category: '',
  description: '',
  amount: '',
  payment_mode: 'Cash',
  vendor: '',
  reference: '',
}

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ExpensesPage() {
  const qc = useQueryClient()
  const now = new Date()
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<ExpenseForm>(emptyForm)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data: expenses = [], isLoading, error: expenseFetchError } = useQuery<Expense[]>({
    queryKey: ['expenses', month],
    queryFn: async () => {
      const res = await fetch(`/api/billing/expenses?month=${month}`)
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (f: ExpenseForm) => {
      const body = {
        date: f.date,
        category: f.category,
        description: f.description || null,
        amount: parseFloat(f.amount),
        payment_mode: f.payment_mode.toLowerCase().replace(/ /g, '_'),
        vendor: f.vendor || null,
        reference: f.reference || null,
      }
      const url = editId ? `/api/billing/expenses/${editId}` : '/api/billing/expenses'
      const method = editId ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      setDialogOpen(false)
      setEditId(null)
      setForm(emptyForm)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/billing/expenses/${id}`, { method: 'DELETE' }).then(r => {
        if (!r.ok) throw new Error('Delete failed')
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      setDeleteConfirm(null)
    },
  })

  function openCreate() {
    setEditId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(e: Expense) {
    setEditId(e.id)
    setForm({
      date: e.date,
      category: e.category,
      description: e.description ?? '',
      amount: String(e.amount),
      payment_mode: e.payment_mode === 'bank_transfer' ? 'Bank Transfer'
        : e.payment_mode === 'credit_card' ? 'Credit Card'
        : e.payment_mode.charAt(0).toUpperCase() + e.payment_mode.slice(1),
      vendor: e.vendor ?? '',
      reference: e.reference ?? '',
    })
    setDialogOpen(true)
  }

  const totalAmount = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses])

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of expenses) {
      map[e.category] = (map[e.category] ?? 0) + Number(e.amount)
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [expenses])

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    const detail = expenses.map(e => ({
      'Date':         e.date,
      'Category':     e.category,
      'Description':  e.description ?? '',
      'Amount':       e.amount,
      'Payment Mode': e.payment_mode,
      'Vendor':       e.vendor ?? '',
      'Reference':    e.reference ?? '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), 'Expenses')

    const summary = byCategory.map(([cat, amt]) => ({
      'Category': cat,
      'Total':    amt,
      '% of Total': totalAmount > 0 ? ((amt / totalAmount) * 100).toFixed(1) + '%' : '0%',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'By Category')
    XLSX.writeFile(wb, `expenses-${month}.xlsx`)
  }

  const isValid = form.date && form.category && form.amount && parseFloat(form.amount) > 0

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Track business expenses by category and month"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5">
              <Download className="w-4 h-4" /> Export
            </Button>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Expense
            </Button>
          </div>
        }
      />

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{editId ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[#434654] block mb-1">Date *</label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="h-9 border-[#C3C5D7]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#434654] block mb-1">Amount (₹) *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="h-9 border-[#C3C5D7]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-[#434654] block mb-1">Category *</label>
              <Select value={form.category || undefined} onValueChange={v => setForm(f => ({ ...f, category: v ?? '' }))}>
                <SelectTrigger className="h-9 border-[#C3C5D7]">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-[#434654] block mb-1">Description</label>
              <Input
                placeholder="Brief description"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="h-9 border-[#C3C5D7]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[#434654] block mb-1">Payment Mode</label>
                <Select value={form.payment_mode || undefined} onValueChange={v => setForm(f => ({ ...f, payment_mode: v ?? 'Cash' }))}>
                  <SelectTrigger className="h-9 border-[#C3C5D7]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#434654] block mb-1">Vendor</label>
                <Input
                  placeholder="Vendor name"
                  value={form.vendor}
                  onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
                  className="h-9 border-[#C3C5D7]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-[#434654] block mb-1">Reference / Bill #</label>
              <Input
                placeholder="Bill or receipt number"
                value={form.reference}
                onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                className="h-9 border-[#C3C5D7]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => { setDialogOpen(false); setEditId(null) }}>Cancel</Button>
              <Button
                size="sm"
                disabled={!isValid || saveMutation.isPending}
                onClick={() => saveMutation.mutate(form)}
              >
                {saveMutation.isPending ? 'Saving…' : editId ? 'Update' : 'Add Expense'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Month filter + summary */}
      <div className="flex flex-wrap items-center gap-4 mb-5">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-[#434654]">Month</label>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="h-9 px-3 rounded-md border border-[#C3C5D7] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A56DB]"
          />
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-[#737686]">Total this month</p>
          <p className="text-lg font-bold text-[#191B23]">{fmt(totalAmount)}</p>
        </div>
      </div>

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <div className="mb-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {byCategory.slice(0, 8).map(([cat, amt]) => (
            <div key={cat} className="bg-white rounded-lg border border-[#E5E7EB] p-3">
              <p className="text-xs text-[#737686] truncate">{cat}</p>
              <p className="text-sm font-semibold text-[#191B23] mt-0.5">{fmt(amt)}</p>
              {totalAmount > 0 && (
                <div className="mt-1.5 h-1 rounded-full bg-[#E5E7EB] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#1A56DB]"
                    style={{ width: `${(amt / totalAmount) * 100}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Expense list */}
      <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-center text-[#737686]">Loading…</p>
        ) : expenseFetchError ? (
          <div className="p-8 text-center">
            <p className="text-red-600 text-sm font-medium">Could not load expenses.</p>
            <p className="text-xs text-[#9CA3AF] mt-1">Make sure the expenses table has been created in Supabase.</p>
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[#737686]">No expenses recorded for this month.</p>
            <Button size="sm" className="mt-3 gap-1.5" onClick={openCreate}>
              <Plus className="w-4 h-4" /> Add First Expense
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#737686] uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#737686] uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#737686] uppercase tracking-wider hidden md:table-cell">Description</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#737686] uppercase tracking-wider hidden lg:table-cell">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#737686] uppercase tracking-wider hidden sm:table-cell">Mode</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[#737686] uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[#737686] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {expenses.map(e => (
                <tr key={e.id} className="hover:bg-[#F9FAFB] transition-colors">
                  <td className="px-4 py-3 text-[#434654] whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-[#EFF6FF] text-[#1A56DB]">
                      {e.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#434654] max-w-[200px] truncate hidden md:table-cell">{e.description ?? '—'}</td>
                  <td className="px-4 py-3 text-[#434654] hidden lg:table-cell">{e.vendor ?? '—'}</td>
                  <td className="px-4 py-3 text-[#9CA3AF] capitalize hidden sm:table-cell">{e.payment_mode.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[#191B23]">{fmt(Number(e.amount))}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {deleteConfirm === e.id ? (
                        <>
                          <button
                            onClick={() => deleteMutation.mutate(e.id)}
                            className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors"
                            title="Confirm delete"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="p-1.5 rounded text-[#9CA3AF] hover:bg-[#F3F4F6] transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => openEdit(e)}
                            className="p-1.5 rounded text-[#737686] hover:bg-[#F3F4F6] transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(e.id)}
                            className="p-1.5 rounded text-[#737686] hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[#F3F4F6] border-t-2 border-[#E5E7EB]">
              <tr>
                <td colSpan={5} className="px-4 py-3 font-semibold text-[#191B23]">Total</td>
                <td className="px-4 py-3 text-right font-bold text-[#191B23]">{fmt(totalAmount)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
