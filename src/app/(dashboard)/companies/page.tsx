'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Building2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Company } from '@/types'

function useCompanies() {
  return useQuery<Company[]>({ queryKey: ['companies'], queryFn: () => fetch('/api/companies').then(r => r.json()) })
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
        <SheetContent className="w-full sm:w-[420px] overflow-y-auto">
          {selectedCompany && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedCompany.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-5">
                <section>
                  <h3 className="text-label-caps text-[#737686] mb-2">Approval Settings</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Require Approval</Label>
                      <Switch
                        checked={selectedCompany.approval_required}
                        onCheckedChange={v => updateCompany(selectedCompany.id, { approval_required: v })}
                      />
                    </div>
                    {selectedCompany.approval_required && (
                      <>
                        <div>
                          <Label className="text-sm mb-1 block">Approval Channel</Label>
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
                          <Label className="text-sm mb-1 block">Timeout (hours)</Label>
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
                  <p className="text-sm text-[#434654]">{selectedCompany.email_domains?.join(', ') || 'None configured'}</p>
                </section>

                <section>
                  <h3 className="text-label-caps text-[#737686] mb-2">Approver Emails</h3>
                  <p className="text-sm text-[#434654]">{selectedCompany.approver_emails?.join(', ') || 'None configured'}</p>
                </section>

                <section>
                  <h3 className="text-label-caps text-[#737686] mb-2">Approver WhatsApp</h3>
                  <p className="text-sm text-[#434654]">{selectedCompany.approver_whatsapp?.join(', ') || 'None configured'}</p>
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
