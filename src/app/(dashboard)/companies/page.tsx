'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Building2, Plus, X, Mail, Phone } from 'lucide-react'
import { toast } from 'sonner'
import type { Company } from '@/types'

function useCompanies() {
  return useQuery<Company[]>({ queryKey: ['companies'], queryFn: () => fetch('/api/companies').then(r => r.json()) })
}

function ExclusionEditor({ exclusions, onSave }: { exclusions: string[]; onSave: (list: string[]) => void }) {
  const [value, setValue] = useState('')

  function handleAdd() {
    const v = value.trim()
    if (!v || exclusions.includes(v)) return
    onSave([...exclusions, v])
    setValue('')
  }

  function handleRemove(item: string) {
    onSave(exclusions.filter(e => e !== item))
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Phone number or email"
          className="border-[#C3C5D7] text-sm"
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
        />
        <Button size="sm" variant="outline" onClick={handleAdd} className="shrink-0">Add</Button>
      </div>
      {exclusions.length > 0 && (
        <div className="space-y-1">
          {exclusions.map(item => (
            <div key={item} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-[#F3F3FE] border border-[#C3C5D7]">
              <span className="text-sm text-[#434654] truncate">{item}</span>
              <button onClick={() => handleRemove(item)} className="text-[#737686] hover:text-red-500 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {exclusions.length === 0 && (
        <p className="text-xs text-[#737686]">No exclusions yet.</p>
      )}
    </div>
  )
}

export default function CompaniesPage() {
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState({ name: '', aliases: '', email_domains: '', approver_emails: '' })

  const { data: companies = [], isLoading } = useCompanies()
  const qc = useQueryClient()

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
                  <p className="text-xs text-[#737686] mb-3">Clients on this list bypass approval and are confirmed directly — add their phone number or email.</p>
                  <ExclusionEditor
                    exclusions={selectedCompany.approval_exclusions ?? []}
                    onSave={list => updateCompany(selectedCompany.id, { approval_exclusions: list })}
                  />
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

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
