'use client'
import { useState } from 'react'
import { useClients, useCreateClient } from '@/hooks/useClients'
import { ClientDetailPanel } from '@/components/clients/ClientDetailPanel'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Search, Plus, Phone, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { Client } from '@/types'

const clientSchema = z.object({
  name: z.string().min(2),
  primary_phone: z.string().min(8).optional().or(z.literal('')),
  primary_email: z.string().email().optional().or(z.literal('')),
  client_type: z.enum(['corporate', 'walkin']),
  designation: z.string().optional(),
})

type ClientFormData = z.infer<typeof clientSchema>

export default function ClientsPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const { data: clients = [], isLoading, isError } = useClients(search || undefined)
  const createClient = useCreateClient()

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: { client_type: 'corporate' },
  })

  const filtered = typeFilter === 'all' ? clients : clients.filter(c => c.client_type === typeFilter)

  async function onSubmit(data: ClientFormData) {
    try {
      await createClient.mutateAsync(data)
      toast.success('Client added')
      setShowAddModal(false)
      reset()
    } catch {
      toast.error('Failed to add client')
    }
  }

  return (
    <div>
      <PageHeader
        title="Clients"
        description={`${filtered.length} clients`}
        actions={
          <Button
            size="sm"
            className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm gap-1.5"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="w-4 h-4" /> Add Client
          </Button>
        }
      />

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#737686]" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, email…"
            className="pl-9 border-[#C3C5D7] h-8 text-sm"
          />
        </div>
        <Select value={typeFilter} onValueChange={v => v !== null && setTypeFilter(v)}>
          <SelectTrigger className="w-40 h-8 text-xs border-[#C3C5D7]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="corporate">Corporate</SelectItem>
            <SelectItem value="walkin">Walk-in</SelectItem>
            <SelectItem value="guest">Guest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-[#737686]">Loading clients…</div>
      ) : isError ? (
        <div className="py-12 text-center text-[#737686] text-sm">Unable to load clients. Please refresh the page.</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-[#737686]">No clients found</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(client => {
            const initials = client.name.split(' ').map(n => n[0]).slice(0, 2).join('')
            const companyName = client.company?.name || (client.client_type === 'guest' && client.guest_of_company ? client.guest_of_company.name : null)
            const avatarGradient =
              client.client_type === 'guest'    ? 'from-amber-400 to-orange-400' :
              client.client_type === 'walkin'   ? 'from-emerald-400 to-teal-500' :
                                                  'from-[#1A56DB] to-[#6366F1]'
            const typePill =
              client.client_type === 'corporate' ? 'bg-blue-50 text-[#1A56DB] border border-blue-200' :
              client.client_type === 'guest'      ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                                    'bg-emerald-50 text-emerald-700 border border-emerald-200'
            return (
              <div
                key={client.id}
                onClick={() => setSelectedClient(client)}
                className="bg-white rounded-2xl border border-[#E5E7EB] p-4 cursor-pointer hover:shadow-lg hover:border-[#1A56DB]/30 hover:-translate-y-0.5 transition-all group"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-base font-bold text-white shrink-0 shadow-sm`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-[#191B23] group-hover:text-[#1A56DB] transition-colors truncate">{client.name}</span>
                        {client.is_vip && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">★ VIP</span>}
                        {client.is_verified && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full shrink-0">✓</span>}
                      </div>
                      {companyName && (
                        <div className="text-xs text-[#737686] mt-0.5 truncate">
                          {client.client_type === 'guest' ? `Guest of ${companyName}` : companyName}
                        </div>
                      )}
                      {client.designation && (
                        <div className="text-xs text-[#9CA3AF] mt-0.5 truncate">{client.designation}</div>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${typePill}`}>
                    {client.client_type}
                  </span>
                </div>

                {(client.primary_phone || client.primary_email) && (
                  <div className="space-y-1.5 border-t border-[#F3F4F6] pt-3">
                    {client.primary_phone && (
                      <div className="flex items-center gap-2 text-xs text-[#434654]">
                        <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                          <Phone className="w-3 h-3 text-[#1A56DB]" />
                        </div>
                        <span className="truncate">{client.primary_phone}</span>
                      </div>
                    )}
                    {client.primary_email && (
                      <div className="flex items-center gap-2 text-xs text-[#434654]">
                        <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                          <Mail className="w-3 h-3 text-[#1A56DB]" />
                        </div>
                        <span className="truncate">{client.primary_email}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ClientDetailPanel
        client={selectedClient}
        open={!!selectedClient}
        onClose={() => setSelectedClient(null)}
      />

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Client</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input {...register('name')} className="border-[#C3C5D7]" />
              {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input {...register('primary_phone')} className="border-[#C3C5D7]" />
              </div>
              <div>
                <Label>Email</Label>
                <Input {...register('primary_email')} type="email" className="border-[#C3C5D7]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type *</Label>
                <Select defaultValue="corporate" onValueChange={v => setValue('client_type', v as 'corporate' | 'walkin')}>
                  <SelectTrigger className="border-[#C3C5D7]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corporate">Corporate</SelectItem>
                    <SelectItem value="walkin">Walk-in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Designation</Label>
                <Input {...register('designation')} className="border-[#C3C5D7]" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button type="submit" className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm" disabled={createClient.isPending}>
                {createClient.isPending ? 'Adding…' : 'Add Client'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
