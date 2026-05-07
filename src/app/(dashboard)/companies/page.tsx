'use client'
import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Building2, Plus, X, Mail, Phone, Search } from 'lucide-react'
import { toast } from 'sonner'
import { ClientDetailPanel } from '@/components/clients/ClientDetailPanel'
import type { Company, Client } from '@/types'

function useCompanies() {
  return useQuery<Company[]>({ queryKey: ['companies'], queryFn: () => fetch('/api/companies').then(r => r.json()) })
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
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState({ name: '', aliases: '', email_domains: '', approver_emails: '' })

  const { data: companies = [], isLoading } = useCompanies()
  const qc = useQueryClient()

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

  return (
    <div>
      <PageHeader
        title="Companies"
        description={`${companies.length} companies`}
        actions={
          <Button
            size="sm"
            className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm gap-1.5"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="w-4 h-4" /> Add Company
          </Button>
        }
      />

      {isLoading ? (
        <div className="py-12 text-center text-[#737686]">Loading companies…</div>
      ) : companies.length === 0 ? (
        <div className="py-12 text-center text-[#737686]">No companies yet. Add your first company.</div>
      ) : (
        <div className="bg-white rounded-lg border border-[#C3C5D7] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#C3C5D7] bg-[#F3F3FE]">
                <th className="text-left px-4 py-2.5 text-label-caps text-[#737686]">Company</th>
                <th className="text-left px-4 py-2.5 text-label-caps text-[#737686] hidden sm:table-cell">Email Domains</th>
                <th className="text-left px-4 py-2.5 text-label-caps text-[#737686]">Approval</th>
                <th className="text-left px-4 py-2.5 text-label-caps text-[#737686] hidden md:table-cell">Channel</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(company => (
                <tr
                  key={company.id}
                  className="border-b border-[#C3C5D7] last:border-0 hover:bg-[#F3F3FE] cursor-pointer transition-colors"
                  onClick={() => setSelectedCompany(company)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#EDEDF8] flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-[#434654]" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-[#191B23]">{company.name}</div>
                        {company.aliases?.length > 0 && (
                          <div className="text-xs text-[#737686]">{company.aliases.join(', ')}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-sm text-[#434654]">
                      {company.email_domains?.join(', ') || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${company.approval_required ? 'bg-[#EDE9FE] text-[#7E3AF2]' : 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                      {company.approval_required ? 'Required' : 'None'}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-sm text-[#434654] capitalize">{company.approval_channel}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Company Detail Panel */}
      <Sheet open={!!selectedCompany} onOpenChange={o => !o && setSelectedCompany(null)}>
        <SheetContent className="w-full sm:w-[440px] px-6 py-0 gap-0" showCloseButton={false}>
          {selectedCompany && (
            <>
              {/* Sticky Header */}
              <div className="flex-shrink-0 pt-5 pb-4 border-b border-[#EEEEF5]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-[#EDEDF8] flex items-center justify-center shrink-0">
                      <Building2 className="w-6 h-6 text-[#434654]" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-[#191B23] leading-tight truncate">{selectedCompany.name}</h2>
                      {selectedCompany.aliases?.length > 0 && (
                        <p className="text-xs text-[#737686] mt-0.5 truncate">{selectedCompany.aliases.join(', ')}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setSelectedCompany(null)}
                    className="shrink-0 mt-0.5 text-[#737686] hover:text-[#191B23]"
                  >
                    <X className="w-4 h-4" />
                    <span className="sr-only">Close</span>
                  </Button>
                </div>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto py-4 space-y-5">

                {/* People */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-label-caps text-[#737686]">People</h3>
                    {(companyClients.length + companyGuests.length) > 0 && (
                      <span className="text-[10px] font-semibold bg-[#EDEDF8] text-[#434654] px-1.5 py-0.5 rounded-full">
                        {companyClients.length + companyGuests.length}
                      </span>
                    )}
                  </div>
                  {companyClients.length === 0 && companyGuests.length === 0 ? (
                    <p className="text-xs text-[#737686]">No clients or guests yet</p>
                  ) : (
                    <div className="space-y-1">
                      {companyClients.map(person => {
                        const initials = person.name.split(' ').map(n => n[0]).slice(0, 2).join('')
                        return (
                          <button
                            key={person.id}
                            onClick={() => setSelectedPerson(person)}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#F3F3FE] transition-colors text-left group"
                          >
                            <div className="w-8 h-8 rounded-full bg-[#D4DCFF] flex items-center justify-center text-xs font-semibold text-[#1A56DB] shrink-0">
                              {initials}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-[#191B23] group-hover:text-[#1A56DB] truncate">{person.name}</div>
                              <div className="text-xs text-[#737686] truncate">
                                {person.primary_phone || person.primary_email || person.designation || 'No contact info'}
                              </div>
                            </div>
                          </button>
                        )
                      })}

                      {companyGuests.length > 0 && (
                        <>
                          {companyClients.length > 0 && (
                            <div className="pt-2 pb-1 px-2.5">
                              <span className="text-[10px] font-semibold text-[#737686] uppercase tracking-wider">Guests</span>
                            </div>
                          )}
                          {companyGuests.map(person => {
                            const initials = person.name.split(' ').map(n => n[0]).slice(0, 2).join('')
                            return (
                              <button
                                key={person.id}
                                onClick={() => setSelectedPerson(person)}
                                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#FEF3C7] transition-colors text-left group"
                              >
                                <div className="w-8 h-8 rounded-full bg-[#FEF3C7] flex items-center justify-center text-xs font-semibold text-[#92400E] shrink-0">
                                  {initials}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-[#191B23] group-hover:text-[#92400E] truncate">{person.name}</div>
                                  <div className="text-xs text-[#737686] truncate">
                                    {person.primary_phone || person.primary_email || 'No contact info'}
                                  </div>
                                </div>
                                <span className="text-[10px] text-[#92400E] bg-[#FEF3C7] border border-[#FCD34D] px-1.5 py-0.5 rounded-full shrink-0">Guest</span>
                              </button>
                            )
                          })}
                        </>
                      )}
                    </div>
                  )}
                </section>

                <Separator />

                <section>
                  <h3 className="text-label-caps text-[#737686] mb-3">Approval Settings</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-1">
                      <Label className="text-sm">Require Approval</Label>
                      <Switch
                        checked={selectedCompany.approval_required}
                        onCheckedChange={v => updateCompany(selectedCompany.id, { approval_required: v })}
                      />
                    </div>
                    {selectedCompany.approval_required && (
                      <>
                        <div>
                          <Label className="text-sm mb-1.5 block">Approval Channel</Label>
                          <Select
                            value={selectedCompany.approval_channel}
                            onValueChange={v => v && updateCompany(selectedCompany.id, { approval_channel: v as Company['approval_channel'] })}
                          >
                            <SelectTrigger className="border-[#C3C5D7]">
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
                          <Label className="text-sm mb-1.5 block">Timeout (hours)</Label>
                          <Input
                            type="number"
                            defaultValue={selectedCompany.approval_timeout_hours}
                            className="border-[#C3C5D7]"
                            onBlur={e => updateCompany(selectedCompany.id, { approval_timeout_hours: parseInt(e.target.value) })}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </section>

                <Separator />

                <section>
                  <h3 className="text-label-caps text-[#737686] mb-2">Email Domains</h3>
                  {selectedCompany.email_domains?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCompany.email_domains.map(d => (
                        <span key={d} className="text-xs bg-[#F3F3FE] border border-[#C3C5D7] text-[#434654] px-2 py-0.5 rounded-md">{d}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#737686]">None configured</p>
                  )}
                </section>

                <section>
                  <h3 className="text-label-caps text-[#737686] mb-2">Approver Emails</h3>
                  {selectedCompany.approver_emails?.length ? (
                    <div className="space-y-1.5">
                      {selectedCompany.approver_emails.map(e => (
                        <div key={e} className="flex items-center gap-2 text-sm text-[#434654]">
                          <Mail className="w-4 h-4 text-[#737686] shrink-0" />
                          <span className="truncate">{e}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#737686]">None configured</p>
                  )}
                </section>

                <section>
                  <h3 className="text-label-caps text-[#737686] mb-2">Approver WhatsApp</h3>
                  {selectedCompany.approver_whatsapp?.length ? (
                    <div className="space-y-1.5">
                      {selectedCompany.approver_whatsapp.map(w => (
                        <div key={w} className="flex items-center gap-2 text-sm text-[#434654]">
                          <Phone className="w-4 h-4 text-[#737686] shrink-0" />
                          <span className="truncate">{w}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#737686]">None configured</p>
                  )}
                </section>

                <Separator />

                <section>
                  <h3 className="text-label-caps text-[#737686] mb-1">Approval Exclusions</h3>
                  <p className="text-xs text-[#737686] mb-3">Clients on this list bypass approval and are confirmed directly.</p>
                  <ClientExclusionPicker
                    companyId={selectedCompany.id}
                    exclusions={selectedCompany.approval_exclusions ?? []}
                    onSave={(list: string[]) => updateCompany(selectedCompany.id, { approval_exclusions: list })}
                  />
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ClientDetailPanel
        client={selectedPerson}
        open={!!selectedPerson}
        onClose={() => setSelectedPerson(null)}
      />

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Company</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <Label>Company Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="border-[#C3C5D7]" />
            </div>
            <div>
              <Label>Aliases (comma-separated)</Label>
              <Input value={form.aliases} onChange={e => setForm(f => ({ ...f, aliases: e.target.value }))} placeholder="Corp, Company Inc" className="border-[#C3C5D7]" />
            </div>
            <div>
              <Label>Email Domains (comma-separated)</Label>
              <Input value={form.email_domains} onChange={e => setForm(f => ({ ...f, email_domains: e.target.value }))} placeholder="company.com, corp.net" className="border-[#C3C5D7]" />
            </div>
            <div>
              <Label>Approver Emails (comma-separated)</Label>
              <Input value={form.approver_emails} onChange={e => setForm(f => ({ ...f, approver_emails: e.target.value }))} placeholder="approver@company.com" className="border-[#C3C5D7]" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button type="submit" className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm">Add Company</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
