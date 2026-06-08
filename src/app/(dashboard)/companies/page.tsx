'use client'
import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Building2, Plus, X, Mail, Phone, Search, GitMerge } from 'lucide-react'
import { useCanEdit } from '@/hooks/useCurrentUser'
import { toast } from 'sonner'
import { ClientDetailPanel } from '@/components/clients/ClientDetailPanel'
import type { Company, Client } from '@/types'

function useCompanies() {
  return useQuery<Company[]>({ queryKey: ['companies'], queryFn: () => fetch('/api/companies').then(r => r.json()) })
}

function DirectEmailPicker({ emails, onSave }: { emails: string[]; onSave: (list: string[]) => void }) {
  const [input, setInput] = useState('')

  function add() {
    const val = input.trim().toLowerCase()
    if (!val || emails.includes(val)) { setInput(''); return }
    onSave([...emails, val])
    setInput('')
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="travel@company.com"
          type="email"
          className="flex-1 px-3 h-8 text-xs border border-[#C3C5D7] rounded-md outline-none focus:border-[#1A56DB] placeholder:text-[#9CA3AF]"
        />
        <Button size="sm" variant="outline" className="h-8 px-3 text-xs rounded-sm" onClick={add} disabled={!input.trim()}>
          Add
        </Button>
      </div>
      {emails.length === 0 ? (
        <p className="text-xs text-[#737686]">No direct booking emails yet.</p>
      ) : (
        <div className="space-y-1">
          {emails.map(e => (
            <div key={e} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-[#F3F3FE] border border-[#C3C5D7]">
              <div className="flex items-center gap-1.5 min-w-0">
                <Mail className="w-3 h-3 text-[#737686] shrink-0" />
                <span className="text-xs text-[#434654] truncate">{e}</span>
              </div>
              <button onClick={() => onSave(emails.filter(x => x !== e))} className="text-[#737686] hover:text-red-500 shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TagInput({
  values,
  onSave,
  placeholder,
  inputType = 'text',
  emptyLabel,
  icon: Icon,
}: {
  values: string[]
  onSave: (list: string[]) => void
  placeholder: string
  inputType?: string
  emptyLabel: string
  icon: React.ElementType
}) {
  const [input, setInput] = useState('')

  function add() {
    const val = input.trim().toLowerCase()
    if (!val || values.includes(val)) { setInput(''); return }
    onSave([...values, val])
    setInput('')
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder={placeholder}
          type={inputType}
          className="flex-1 px-3 h-8 text-xs border border-[#C3C5D7] rounded-md outline-none focus:border-[#1A56DB] placeholder:text-[#9CA3AF]"
        />
        <Button size="sm" variant="outline" className="h-8 px-3 text-xs rounded-sm" onClick={add} disabled={!input.trim()}>
          Add
        </Button>
      </div>
      {values.length === 0 ? (
        <p className="text-xs text-[#737686]">{emptyLabel}</p>
      ) : (
        <div className="space-y-1">
          {values.map(v => (
            <div key={v} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-[#F3F3FE] border border-[#C3C5D7]">
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon className="w-3 h-3 text-[#737686] shrink-0" />
                <span className="text-xs text-[#434654] truncate">{v}</span>
              </div>
              <button onClick={() => onSave(values.filter(x => x !== v))} className="text-[#737686] hover:text-red-500 shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ClientExclusionPicker({
  companyId,
  exclusions,
  onSave,
}: {
  companyId: string
  exclusions: string[]
  onSave: (list: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: allClients = [] } = useQuery<Client[]>({
    queryKey: ['clients', 'company', companyId],
    queryFn: () => fetch(`/api/clients?company_id=${companyId}`).then(r => r.json()),
  })

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const excludedClients = allClients.filter(c => exclusions.includes(c.id))
  const available = allClients.filter(
    c => !exclusions.includes(c.id) && (
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.primary_phone?.includes(search) ||
      c.primary_email?.toLowerCase().includes(search.toLowerCase())
    )
  )

  function addClient(client: Client) {
    onSave([...exclusions, client.id])
    setSearch('')
    setOpen(false)
  }

  function removeClient(clientId: string) {
    onSave(exclusions.filter(id => id !== clientId))
  }

  return (
    <div className="space-y-2">
      {/* Searchable dropdown trigger */}
      <div ref={ref} className="relative">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded border border-[#C3C5D7] bg-white cursor-pointer"
          onClick={() => setOpen(o => !o)}
        >
          <Search className="w-3.5 h-3.5 text-[#737686] shrink-0" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true) }}
            placeholder="Search clients to exclude…"
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-[#737686]"
            onClick={e => { e.stopPropagation(); setOpen(true) }}
          />
        </div>
        {open && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[#C3C5D7] rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {available.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-[#737686]">
                {allClients.length === 0 ? 'No clients under this company yet.' : 'No matching clients.'}
              </p>
            ) : (
              available.map(client => (
                <button
                  key={client.id}
                  onClick={() => addClient(client)}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-[#F3F3FE] text-left transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-[#D4DCFF] flex items-center justify-center text-xs font-semibold text-[#1A56DB] shrink-0 mt-0.5">
                    {client.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#191B23] truncate">{client.name}</div>
                    <div className="text-xs text-[#737686] flex items-center gap-2 flex-wrap">
                      {client.primary_phone && <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{client.primary_phone}</span>}
                      {client.primary_email && <span className="flex items-center gap-0.5"><Mail className="w-2.5 h-2.5" />{client.primary_email}</span>}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Excluded clients list */}
      {excludedClients.length > 0 && (
        <div className="space-y-1">
          {excludedClients.map(client => (
            <div key={client.id} className="flex items-center justify-between gap-2 px-2.5 py-2 rounded bg-[#F3F3FE] border border-[#C3C5D7]">
              <div className="min-w-0">
                <div className="text-sm font-medium text-[#191B23] truncate">{client.name}</div>
                <div className="text-xs text-[#737686] flex items-center gap-2 flex-wrap">
                  {client.primary_phone && <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{client.primary_phone}</span>}
                  {client.primary_email && <span className="flex items-center gap-0.5"><Mail className="w-2.5 h-2.5" />{client.primary_email}</span>}
                </div>
              </div>
              <button onClick={() => removeClient(client.id)} className="text-[#737686] hover:text-red-500 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {excludedClients.length === 0 && (
        <p className="text-xs text-[#737686]">No exclusions yet. Search and select clients above.</p>
      )}
    </div>
  )
}

export default function CompaniesPage() {
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<Client | null>(null)
  const [peopleSearch, setPeopleSearch] = useState('')
  const [peopleFilter, setPeopleFilter] = useState<'all' | 'employee' | 'guest'>('all')
  const [showAddModal, setShowAddModal] = useState(false)

  // Company merge
  const [search, setSearch] = useState('')
  const [showCompanyMerge, setShowCompanyMerge] = useState(false)
  const [companyMergeSearch, setCompanyMergeSearch] = useState('')
  const [companyMergeResults, setCompanyMergeResults] = useState<Company[]>([])
  const [selectedMergeCompany, setSelectedMergeCompany] = useState<Company | null>(null)
  const [mergingCompany, setMergingCompany] = useState(false)
  const [form, setForm] = useState({ name: '', aliases: '', email_domains: '', approver_emails: '' })

  const { data: companies = [], isLoading } = useCompanies()
  const qc = useQueryClient()
  const canEdit = useCanEdit()

  const { data: companyClients = [] } = useQuery<Client[]>({
    queryKey: ['clients', 'company', selectedCompany?.id],
    queryFn: () => fetch(`/api/clients?company_id=${selectedCompany!.id}`).then(r => r.json()),
    enabled: !!selectedCompany,
  })

  const { data: companyGuests = [] } = useQuery<Client[]>({
    queryKey: ['clients', 'guests', selectedCompany?.id],
    queryFn: () => fetch(`/api/clients?guest_of_company_id=${selectedCompany!.id}`).then(r => r.json()),
    enabled: !!selectedCompany,
  })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    try {
      await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          aliases: form.aliases ? form.aliases.split(',').map(s => s.trim()) : [],
          email_domains: form.email_domains ? form.email_domains.split(',').map(s => s.trim()) : [],
          approver_emails: form.approver_emails ? form.approver_emails.split(',').map(s => s.trim()) : [],
        }),
      })
      qc.invalidateQueries({ queryKey: ['companies'] })
      toast.success('Company added')
      setShowAddModal(false)
      setForm({ name: '', aliases: '', email_domains: '', approver_emails: '' })
    } catch {
      toast.error('Failed to add company')
    }
  }

  async function updateCompany(id: string, updates: Partial<Company>) {
    await fetch(`/api/companies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    qc.invalidateQueries({ queryKey: ['companies'] })
    setSelectedCompany(prev => prev ? { ...prev, ...updates } : null)
    toast.success('Company updated')
  }

  async function searchCompaniesForMerge(q: string) {
    setCompanyMergeSearch(q)
    if (q.length < 2) { setCompanyMergeResults([]); return }
    const res = await fetch(`/api/companies?q=${encodeURIComponent(q)}`)
    if (!res.ok) return
    const data: Company[] = await res.json()
    setCompanyMergeResults(data.filter(c => c.id !== selectedCompany?.id))
  }

  function resetCompanyMerge() {
    setShowCompanyMerge(false)
    setCompanyMergeSearch('')
    setCompanyMergeResults([])
    setSelectedMergeCompany(null)
  }

  async function handleCompanyMerge() {
    if (!selectedMergeCompany || !selectedCompany) return
    setMergingCompany(true)
    try {
      const res = await fetch(`/api/companies/${selectedCompany.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merge_from_id: selectedMergeCompany.id }),
      })
      if (!res.ok) throw new Error()
      qc.invalidateQueries({ queryKey: ['companies'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success(`Merged ${selectedMergeCompany.name} into ${selectedCompany.name}`)
      resetCompanyMerge()
    } catch {
      toast.error('Failed to merge companies')
    } finally {
      setMergingCompany(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Companies"
        description={`${companies.length} companies`}
        actions={canEdit ? (
          <Button
            size="sm"
            className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm gap-1.5"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="w-4 h-4" /> Add Company
          </Button>
        ) : undefined}
      />

      <div className="relative mb-5 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#737686]" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, alias, domain…"
          className="pl-9 border-[#C3C5D7] h-8 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-[#737686]">Loading companies…</div>
      ) : companies.length === 0 ? (
        <div className="py-12 text-center text-[#737686]">No companies yet. Add your first company.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.filter(c => {
            if (!search.trim()) return true
            const q = search.toLowerCase()
            return (
              c.name.toLowerCase().includes(q) ||
              c.aliases?.some(a => a.toLowerCase().includes(q)) ||
              c.email_domains?.some(d => d.toLowerCase().includes(q))
            )
          }).map(company => (
            <div
              key={company.id}
              className="bg-white rounded-2xl border border-[#E5E7EB] p-4 cursor-pointer hover:shadow-lg hover:border-[#0284C7]/30 hover:-translate-y-0.5 transition-all group"
              onClick={() => { setSelectedCompany(company); setPeopleSearch(''); setPeopleFilter('all') }}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0284C7] to-[#6366F1] flex items-center justify-center shrink-0 shadow-sm">
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#191B23] group-hover:text-[#0284C7] transition-colors truncate">{company.name}</div>
                    {company.aliases?.length > 0 && (
                      <div className="text-xs text-[#737686] truncate mt-0.5">{company.aliases.join(', ')}</div>
                    )}
                  </div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${company.approval_required ? 'bg-[#EDE9FE] text-[#7E3AF2] border border-violet-200' : 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                  {company.approval_required ? '✓ Approval' : 'No approval'}
                </span>
              </div>

              {(company.email_domains?.length > 0 || company.approval_channel) && (
                <div className="border-t border-[#F3F4F6] pt-3 space-y-2">
                  {company.email_domains?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {company.email_domains.slice(0, 3).map(d => (
                        <span key={d} className="text-[10px] bg-blue-50 border border-blue-100 text-[#1A56DB] px-1.5 py-0.5 rounded-full font-medium">{d}</span>
                      ))}
                      {company.email_domains.length > 3 && (
                        <span className="text-[10px] text-[#9CA3AF]">+{company.email_domains.length - 3} more</span>
                      )}
                    </div>
                  )}
                  {company.approval_channel && company.approval_required && (
                    <div className="text-xs text-[#737686] capitalize">
                      via <span className="font-medium text-[#434654]">{company.approval_channel}</span>
                      {company.approval_timeout_hours && <span className="text-[#9CA3AF]"> · {company.approval_timeout_hours}h timeout</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Company Detail Panel */}
      <Sheet open={!!selectedCompany} onOpenChange={o => !o && setSelectedCompany(null)}>
        <SheetContent className="w-full md:w-3/4 lg:w-1/2 px-0 py-0 gap-0" showCloseButton={false}>
          {selectedCompany && (
            <>
              {/* Gradient Header */}
              <div className="flex-shrink-0 bg-gradient-to-br from-[#0284C7] to-[#6366F1] pt-5 pb-5 px-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-14 h-14 rounded-xl bg-white/20 border-2 border-white/30 flex items-center justify-center shrink-0">
                      <Building2 className="w-7 h-7 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-white leading-tight truncate">{selectedCompany.name}</h2>
                      {selectedCompany.aliases?.length > 0 && (
                        <p className="text-xs text-white/70 mt-0.5 truncate">{selectedCompany.aliases.join(', ')}</p>
                      )}
                      <span className={`inline-block mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${selectedCompany.approval_required ? 'bg-violet-400/30 text-violet-100' : 'bg-white/20 text-white/80'}`}>
                        {selectedCompany.approval_required ? '✓ Approval required' : 'No approval'}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setSelectedCompany(null)}
                    className="shrink-0 mt-0.5 text-white/80 hover:text-white hover:bg-white/20"
                  >
                    <X className="w-4 h-4" />
                    <span className="sr-only">Close</span>
                  </Button>
                </div>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto py-5 px-5 space-y-4 bg-[#F9FAFB]">

                {/* ── People ── */}
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">People</h3>
                      {(companyClients.length + companyGuests.length) > 0 && (
                        <span className="text-[10px] font-semibold bg-[#EDEDF8] text-[#434654] px-1.5 py-0.5 rounded-full">
                          {companyClients.length + companyGuests.length}
                        </span>
                      )}
                    </div>
                    <div className="flex rounded-md border border-[#C3C5D7] overflow-hidden text-[10px]">
                      {(['all', 'employee', 'guest'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setPeopleFilter(f)}
                          className={`px-2.5 h-6 border-r last:border-r-0 border-[#C3C5D7] capitalize transition-colors ${
                            peopleFilter === f ? 'bg-[#1A56DB] text-white' : 'bg-white text-[#434654] hover:bg-[#F3F3FE]'
                          }`}
                        >
                          {f === 'all' ? 'All' : f === 'employee' ? 'Employees' : 'Guests'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="relative mb-3">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#737686]" />
                    <input
                      value={peopleSearch}
                      onChange={e => setPeopleSearch(e.target.value)}
                      placeholder="Search by name, phone or email…"
                      className="w-full pl-8 pr-3 h-8 text-xs border border-[#C3C5D7] rounded-md bg-white outline-none focus:border-[#1A56DB] placeholder:text-[#9CA3AF]"
                    />
                  </div>
                  {(() => {
                    const seen = new Set<string>()
                    const allPeople = [
                      ...companyClients.map(c => ({ ...c, _role: c.client_type === 'guest' ? 'guest' as const : 'employee' as const })),
                      ...companyGuests.map(c => ({ ...c, _role: 'guest' as const })),
                    ].filter(p => seen.has(p.id) ? false : (seen.add(p.id), true))
                    const q = peopleSearch.toLowerCase()
                    const visible = allPeople.filter(p => {
                      if (peopleFilter === 'employee' && p._role !== 'employee') return false
                      if (peopleFilter === 'guest' && p._role !== 'guest') return false
                      if (!q) return true
                      return (
                        p.name.toLowerCase().includes(q) ||
                        p.primary_phone?.includes(q) ||
                        p.primary_email?.toLowerCase().includes(q)
                      )
                    })
                    if (allPeople.length === 0) return <p className="text-xs text-[#9CA3AF]">No clients or guests yet</p>
                    if (visible.length === 0) return <p className="text-xs text-[#9CA3AF]">No matches found</p>
                    return (
                      <div className="space-y-0.5">
                        {visible.map(person => {
                          const initials = person.name.split(' ').map(n => n[0]).slice(0, 2).join('')
                          const isGuest = person._role === 'guest'
                          return (
                            <button
                              key={person.id}
                              onClick={() => setSelectedPerson(person)}
                              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#F3F3FE] transition-colors text-left group"
                            >
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${isGuest ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#D4DCFF] text-[#1A56DB]'}`}>
                                {initials}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-[#191B23] group-hover:text-[#1A56DB] truncate">{person.name}</div>
                                <div className="text-xs text-[#737686] truncate">
                                  {person.primary_phone || person.primary_email || person.designation || 'No contact info'}
                                </div>
                              </div>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${isGuest ? 'text-[#92400E] bg-[#FEF3C7] border-[#FCD34D]' : 'text-[#1A56DB] bg-[#EBF5FF] border-[#BFDBFE]'}`}>
                                {isGuest ? 'Guest' : 'Employee'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>

                {/* ── Settings (edit-gated) ── */}
                <div className={!canEdit ? 'pointer-events-none opacity-60 space-y-4' : 'space-y-4'}>

                  {/* Card 0: Company Info */}
                  <div className="bg-white rounded-xl border border-[#E5E7EB] divide-y divide-[#F3F4F6] overflow-hidden">
                    <div className="p-4 space-y-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Company Name</h3>
                      <Input
                        key={selectedCompany.id + '-name'}
                        defaultValue={selectedCompany.name}
                        placeholder="Company name"
                        className="border-[#C3C5D7] text-sm"
                        onBlur={e => {
                          const val = e.target.value.trim()
                          if (val && val !== selectedCompany.name) {
                            updateCompany(selectedCompany.id, { name: val })
                          }
                        }}
                      />
                    </div>
                    <div className="p-4 space-y-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">GSTIN</h3>
                      <p className="text-xs text-[#9CA3AF]">15-character GST registration number. Printed on invoices.</p>
                      <Input
                        key={selectedCompany.id + '-gstin'}
                        defaultValue={selectedCompany.gstin ?? ''}
                        placeholder="e.g. 29AABCT1332L1ZN"
                        className="border-[#C3C5D7] text-sm uppercase"
                        maxLength={15}
                        onBlur={e => {
                          const val = e.target.value.trim().toUpperCase() || null
                          if (val !== (selectedCompany.gstin ?? null)) {
                            updateCompany(selectedCompany.id, { gstin: val })
                          }
                        }}
                      />
                    </div>
                    <div className="p-4 space-y-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Billing Address</h3>
                      <p className="text-xs text-[#9CA3AF]">Printed on invoices under the client's name.</p>
                      <textarea
                        key={selectedCompany.id + '-address'}
                        defaultValue={selectedCompany.address ?? ''}
                        placeholder={'No.259, Amarjyothi, HBCS Layout,\nDomlur, Bengaluru - 560071'}
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-[#C3C5D7] rounded-md outline-none focus:border-[#1A56DB] placeholder:text-[#9CA3AF] resize-none"
                        onBlur={e => {
                          const val = e.target.value.trim() || null
                          if (val !== (selectedCompany.address ?? null)) {
                            updateCompany(selectedCompany.id, { address: val })
                          }
                        }}
                      />
                    </div>
                    <div className="p-4 space-y-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Aliases</h3>
                      <p className="text-xs text-[#9CA3AF]">Alternative names used to match this company in emails and messages.</p>
                      <TagInput
                        values={selectedCompany.aliases ?? []}
                        onSave={list => updateCompany(selectedCompany.id, { aliases: list })}
                        placeholder="e.g. Nirvana, NF Films"
                        emptyLabel="No aliases configured"
                        icon={Building2}
                      />
                    </div>
                  </div>

                  {/* Card 1: Approval & Booking Rules */}
                  <div className="bg-white rounded-xl border border-[#E5E7EB] divide-y divide-[#F3F4F6] overflow-hidden">
                    <div className="p-4 space-y-3">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Approval Settings</h3>
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Require Approval</Label>
                        <Switch
                          checked={selectedCompany.approval_required}
                          onCheckedChange={v => updateCompany(selectedCompany.id, { approval_required: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm">Formal Address (Sir / Madam)</Label>
                          <p className="text-[11px] text-[#9CA3AF] mt-0.5">Clients addressed with Sir or Madam in all messages</p>
                        </div>
                        <Switch
                          checked={!!selectedCompany.formal_address}
                          onCheckedChange={v => updateCompany(selectedCompany.id, { formal_address: v })}
                        />
                      </div>
                      {selectedCompany.approval_required && (
                        <div className="space-y-3 pt-1">
                          <div>
                            <Label className="text-xs font-medium text-[#6B7280] mb-1.5 block">Approval Channel</Label>
                            <Select
                              value={selectedCompany.approval_channel}
                              onValueChange={v => v && updateCompany(selectedCompany.id, { approval_channel: v as Company['approval_channel'] })}
                            >
                              <SelectTrigger className="border-[#C3C5D7] h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="email">Email</SelectItem>
                                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                <SelectItem value="both">Both</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs font-medium text-[#6B7280] mb-1.5 block">Timeout (hours)</Label>
                            <Input
                              type="number"
                              defaultValue={selectedCompany.approval_timeout_hours}
                              className="border-[#C3C5D7] h-9 text-sm"
                              onBlur={e => updateCompany(selectedCompany.id, { approval_timeout_hours: parseInt(e.target.value) })}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-4 space-y-3">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Email Intake</h3>
                      <p className="text-xs text-[#9CA3AF]">Which senders can create bookings via email.</p>
                      <div className="flex rounded-md border border-[#C3C5D7] overflow-hidden text-xs">
                        {([
                          { val: 'domain',           label: 'All senders' },
                          { val: 'specific_senders', label: 'Specific senders' },
                          { val: 'off',              label: 'Off' },
                        ] as const).map(opt => (
                          <button
                            key={opt.val}
                            onClick={() => updateCompany(selectedCompany.id, { email_intake_mode: opt.val })}
                            className={`flex-1 h-8 border-r last:border-r-0 border-[#C3C5D7] transition-colors ${
                              (selectedCompany.email_intake_mode || 'domain') === opt.val
                                ? 'bg-[#1A56DB] text-white'
                                : 'bg-white text-[#434654] hover:bg-[#F3F3FE]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {(selectedCompany.email_intake_mode || 'domain') === 'off' && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                          Emails from this company&apos;s domains will be ignored.
                        </p>
                      )}
                      {selectedCompany.email_intake_mode === 'specific_senders' && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-[#374151]">Direct booking emails</p>
                          <p className="text-xs text-[#9CA3AF]">Only these addresses can submit bookings — they skip approval.</p>
                          <DirectEmailPicker
                            emails={selectedCompany.direct_booking_emails ?? []}
                            onSave={list => updateCompany(selectedCompany.id, { direct_booking_emails: list })}
                          />
                        </div>
                      )}
                    </div>

                    <div className="p-4 space-y-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Driver Details — Notify</h3>
                      <p className="text-xs text-[#9CA3AF]">Who receives driver name, phone and vehicle when a trip is assigned.</p>
                      <div className="flex rounded-md border border-[#C3C5D7] overflow-hidden text-xs">
                        {([
                          { val: 'booker', label: 'Booker only' },
                          { val: 'guest',  label: 'Guest only' },
                          { val: 'both',   label: 'Both' },
                        ] as const).map(opt => (
                          <button
                            key={opt.val}
                            onClick={() => updateCompany(selectedCompany.id, { driver_notify_target: opt.val })}
                            className={`flex-1 h-8 border-r last:border-r-0 border-[#C3C5D7] transition-colors ${
                              (selectedCompany.driver_notify_target || 'both') === opt.val
                                ? 'bg-[#1A56DB] text-white'
                                : 'bg-white text-[#434654] hover:bg-[#F3F3FE]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Trip Origin Address</h3>
                      <p className="text-xs text-[#9CA3AF]">
                        Dead mileage (office → pickup, drop → office) is calculated from here.
                        Leave blank to use the JMS Travels office from Settings.
                      </p>
                      <Input
                        key={selectedCompany.id}
                        defaultValue={selectedCompany.pickup_origin_address ?? ''}
                        placeholder="e.g. 123 Whitefield Main Rd, Bangalore 560066"
                        className="border-[#C3C5D7] text-sm"
                        onBlur={e => {
                          const val = e.target.value.trim()
                          if (val !== (selectedCompany.pickup_origin_address ?? '')) {
                            updateCompany(selectedCompany.id, { pickup_origin_address: val || null })
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Card 2: Contact Channels */}
                  <div className="bg-white rounded-xl border border-[#E5E7EB] divide-y divide-[#F3F4F6] overflow-hidden">
                    <div className="p-4 space-y-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Email Domains</h3>
                      <p className="text-xs text-[#9CA3AF]">Emails from these domains are auto-matched to this company.</p>
                      <TagInput
                        values={selectedCompany.email_domains ?? []}
                        onSave={list => updateCompany(selectedCompany.id, { email_domains: list })}
                        placeholder="company.com"
                        emptyLabel="No domains configured"
                        icon={Mail}
                      />
                    </div>
                    <div className="p-4 space-y-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Approver Emails</h3>
                      <p className="text-xs text-[#9CA3AF]">Approval requests are sent to these email addresses.</p>
                      <TagInput
                        values={selectedCompany.approver_emails ?? []}
                        onSave={list => updateCompany(selectedCompany.id, { approver_emails: list })}
                        placeholder="approver@company.com"
                        inputType="email"
                        emptyLabel="No approver emails configured"
                        icon={Mail}
                      />
                    </div>
                    <div className="p-4 space-y-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Approver WhatsApp</h3>
                      <p className="text-xs text-[#9CA3AF]">Approval requests are sent to these WhatsApp numbers.</p>
                      <TagInput
                        values={selectedCompany.approver_whatsapp ?? []}
                        onSave={list => updateCompany(selectedCompany.id, { approver_whatsapp: list })}
                        placeholder="+91 98000 00000"
                        inputType="tel"
                        emptyLabel="No WhatsApp numbers configured"
                        icon={Phone}
                      />
                    </div>
                  </div>

                  {/* Card 3: Approval Exclusions */}
                  <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 space-y-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Approval Exclusions</h3>
                    <p className="text-xs text-[#9CA3AF]">Clients on this list bypass approval and are confirmed directly.</p>
                    <ClientExclusionPicker
                      companyId={selectedCompany.id}
                      exclusions={selectedCompany.approval_exclusions ?? []}
                      onSave={(list: string[]) => updateCompany(selectedCompany.id, { approval_exclusions: list })}
                    />
                  </div>

                  {/* Card 4: Bata Rates */}
                  <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                    <CompanyBataRates companyId={selectedCompany.id} />
                  </div>

                </div>
              </div>

              {/* Sticky Footer */}
              {canEdit && (
              <div className="flex-shrink-0 py-4 px-6 border-t border-[#EEEEF5]">
                <Button
                  variant="outline" size="sm"
                  className="rounded-sm text-xs px-4 gap-1.5 text-[#737686]"
                  onClick={() => setShowCompanyMerge(true)}
                >
                  <GitMerge className="w-3 h-3" /> Merge Duplicate
                </Button>
              </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <ClientDetailPanel
        client={selectedPerson}
        open={!!selectedPerson}
        onClose={() => setSelectedPerson(null)}
      />

      {/* ── Merge Company ── */}
      <Dialog open={showCompanyMerge} onOpenChange={o => { if (!o) resetCompanyMerge() }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Merge Companies</DialogTitle></DialogHeader>
          {!selectedMergeCompany ? (
            <div className="space-y-3">
              <p className="text-sm text-[#737686]">
                Search for the duplicate company to merge into <span className="font-medium text-[#191B23]">{selectedCompany?.name}</span>. All clients, guests and bookings will move across.
              </p>
              <input
                value={companyMergeSearch}
                onChange={e => searchCompaniesForMerge(e.target.value)}
                placeholder="Search company name…"
                autoFocus
                className="w-full px-3 h-9 text-sm border border-[#C3C5D7] rounded-md outline-none focus:border-[#1A56DB] placeholder:text-[#9CA3AF]"
              />
              {companyMergeResults.length > 0 && (
                <div className="border border-[#C3C5D7] rounded-md overflow-hidden max-h-48 overflow-y-auto">
                  {companyMergeResults.map(co => (
                    <button
                      key={co.id}
                      onClick={() => setSelectedMergeCompany(co)}
                      className="w-full text-left px-3 py-2.5 hover:bg-[#F3F3FE] border-b border-[#C3C5D7] last:border-0 transition-colors"
                    >
                      <div className="text-sm font-medium text-[#191B23]">{co.name}</div>
                      {co.aliases?.length > 0 && <div className="text-xs text-[#737686]">{co.aliases.join(', ')}</div>}
                    </button>
                  ))}
                </div>
              )}
              {companyMergeSearch.length >= 2 && companyMergeResults.length === 0 && (
                <p className="text-xs text-[#737686]">No other companies found</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800 mb-1.5">The following company will be permanently deleted:</p>
                <p className="text-sm font-medium text-amber-900">{selectedMergeCompany.name}</p>
                {selectedMergeCompany.aliases?.length > 0 && (
                  <p className="text-xs text-amber-700 mt-0.5">{selectedMergeCompany.aliases.join(', ')}</p>
                )}
              </div>
              <p className="text-sm text-[#737686]">
                All clients, guests and bookings from <span className="font-medium text-[#434654]">{selectedMergeCompany.name}</span> will move to <span className="font-medium text-[#191B23]">{selectedCompany?.name}</span>. Aliases and email domains will be combined. This cannot be undone.
              </p>
            </div>
          )}
          <DialogFooter>
            {!selectedMergeCompany ? (
              <Button variant="outline" onClick={resetCompanyMerge}>Cancel</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setSelectedMergeCompany(null)} disabled={mergingCompany}>Back</Button>
                <Button className="bg-red-600 hover:bg-red-700 rounded-sm" onClick={handleCompanyMerge} disabled={mergingCompany}>
                  {mergingCompany ? 'Merging…' : 'Confirm Merge'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl gap-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Add Company</DialogTitle>
          </DialogHeader>

          {/* Gradient header */}
          <div className="bg-gradient-to-br from-[#0284C7] to-[#6366F1] px-5 pt-5 pb-6">
            <div className="flex items-start justify-between gap-3">
              <div className="text-white">
                <p className="text-[11px] font-medium text-white/60 uppercase tracking-wider">New Company</p>
                <h2 className="text-xl font-bold mt-0.5">
                  {form.name.trim() || 'Add company'}
                </h2>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white/20 border-2 border-white/40 flex items-center justify-center shrink-0">
                {form.name.trim()
                  ? <span className="text-lg font-bold text-white">{form.name.trim().split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}</span>
                  : <Building2 className="w-6 h-6 text-white/60" />
                }
              </div>
            </div>
          </div>

          <form onSubmit={handleAdd} className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#434654]">Company Name *</Label>
              <div className="relative">
                <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Acme Corporation"
                  required
                  className="pl-8 border-[#C3C5D7] h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#434654]">Aliases <span className="text-[#9CA3AF] font-normal">(comma-separated)</span></Label>
              <Input
                value={form.aliases}
                onChange={e => setForm(f => ({ ...f, aliases: e.target.value }))}
                placeholder="Acme, ACME Corp"
                className="border-[#C3C5D7] h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#434654]">Email Domains <span className="text-[#9CA3AF] font-normal">(comma-separated)</span></Label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
                <Input
                  value={form.email_domains}
                  onChange={e => setForm(f => ({ ...f, email_domains: e.target.value }))}
                  placeholder="acme.com, acmecorp.net"
                  className="pl-8 border-[#C3C5D7] h-9 text-sm"
                />
              </div>
              <p className="text-[11px] text-[#9CA3AF]">Used to auto-link inbound emails to this company.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#434654]">Approver Emails <span className="text-[#9CA3AF] font-normal">(comma-separated)</span></Label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
                <Input
                  value={form.approver_emails}
                  onChange={e => setForm(f => ({ ...f, approver_emails: e.target.value }))}
                  placeholder="manager@acme.com"
                  className="pl-8 border-[#C3C5D7] h-9 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1 border-t border-[#F3F4F6]">
              <Button type="button" variant="outline" onClick={() => setShowAddModal(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1 bg-gradient-to-r from-[#0284C7] to-[#6366F1] hover:opacity-90 transition-opacity rounded-sm text-white border-0 shadow-sm">
                Add Company
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const TRIP_TYPE_LABELS: Record<string, string> = { local: 'Local', outstation: 'Outstation', airport: 'Airport' }

function CompanyBataRates({ companyId }: { companyId: string }) {
  const qc = useQueryClient()
  const [vehicleName, setVehicleName] = useState('')
  const [tripType, setTripType] = useState<string>('local')
  const [rate, setRate] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: vehicleNames = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['vehicle-names'],
    queryFn: () => fetch('/api/vehicle-names').then(r => r.json()),
  })

  const { data: rates = [] } = useQuery<{ id: string; vehicle_name: string; trip_type: string | null; rate_per_bata: number; driver_bata_rate: number | null }[]>({
    queryKey: ['company-bata-rates', companyId],
    queryFn: () => fetch(`/api/companies/${companyId}/bata-rates`).then(r => r.json()),
  })

  async function handleAdd() {
    if (!vehicleName || !rate) return
    setSaving(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/bata-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicle_name: vehicleName, rate_per_bata: Number(rate), trip_type: tripType || null }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      qc.invalidateQueries({ queryKey: ['company-bata-rates', companyId] })
      setVehicleName('')
      setRate('')
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(rateId: string) {
    await fetch(`/api/companies/${companyId}/bata-rates?rate_id=${rateId}`, { method: 'DELETE' })
    qc.invalidateQueries({ queryKey: ['company-bata-rates', companyId] })
  }

  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#059669] mb-1">Bata Rates</h3>
      <p className="text-xs text-[#737686] mb-3">Set bata rates per vehicle and trip type for this company. Overrides the driver's default rate.</p>

      <div className="space-y-1.5 mb-3">
        {rates.length === 0 ? (
          <p className="text-xs text-[#737686]">No overrides — driver default rates apply.</p>
        ) : rates.map(r => (
          <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#191B23]">{r.vehicle_name}</span>
              {r.trip_type ? (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  r.trip_type === 'local' ? 'bg-blue-100 text-blue-700'
                  : r.trip_type === 'outstation' ? 'bg-orange-100 text-orange-700'
                  : 'bg-purple-100 text-purple-700'
                }`}>{TRIP_TYPE_LABELS[r.trip_type] ?? r.trip_type}</span>
              ) : (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">All</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs font-bold text-[#059669]">₹{r.rate_per_bata}/bata</div>
              </div>
              <button onClick={() => handleDelete(r.id)} className="text-[#737686] hover:text-red-500">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Select value={vehicleName} onValueChange={v => v !== null && setVehicleName(v)}>
          <SelectTrigger className="border-[#C3C5D7] h-8 text-xs flex-1">
            <SelectValue placeholder="Select vehicle…" />
          </SelectTrigger>
          <SelectContent>
            {vehicleNames.map(v => <SelectItem key={v.id} value={v.name} className="text-xs">{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tripType} onValueChange={v => v !== null && setTripType(v)}>
          <SelectTrigger className="border-[#C3C5D7] h-8 text-xs w-32">
            <SelectValue placeholder="Trip type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="local" className="text-xs">Local</SelectItem>
            <SelectItem value="outstation" className="text-xs">Outstation</SelectItem>
            <SelectItem value="airport" className="text-xs">Airport</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          value={rate}
          onChange={e => setRate(e.target.value)}
          placeholder="₹ per bata"
          className="border-[#C3C5D7] h-8 text-xs w-28"
        />
        <Button size="sm" className="bg-[#059669] hover:bg-[#047857] rounded-sm h-8 gap-1" onClick={handleAdd} disabled={saving || !vehicleName || !rate}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
      <p className="text-xs text-[#9CA3AF] mt-1">Client bata billing rate only. Driver bata rates → Billing → Rate Cards → Driver Overrides.</p>
    </section>
  )
}
