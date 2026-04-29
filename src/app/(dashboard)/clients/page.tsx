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
import { Badge } from '@/components/ui/badge'
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

  const { data: clients = [], isLoading } = useClients(search || undefined)
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
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-[#737686]">Loading clients…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-[#737686]">No clients found</div>
      ) : (
        <div className="bg-white rounded-lg border border-[#C3C5D7] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#C3C5D7] bg-[#F3F3FE]">
                <th className="text-left px-4 py-2.5 text-label-caps text-[#737686]">Client</th>
                <th className="text-left px-4 py-2.5 text-label-caps text-[#737686] hidden sm:table-cell">Company</th>
                <th className="text-left px-4 py-2.5 text-label-caps text-[#737686] hidden md:table-cell">Contact</th>
                <th className="text-left px-4 py-2.5 text-label-caps text-[#737686]">Type</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(client => {
                const initials = client.name.split(' ').map(n => n[0]).slice(0, 2).join('')
                return (
                  <tr
                    key={client.id}
                    className="border-b border-[#C3C5D7] last:border-0 hover:bg-[#F3F3FE] cursor-pointer transition-colors"
                    onClick={() => setSelectedClient(client)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#D4DCFF] flex items-center justify-center text-xs font-semibold text-[#1A56DB] shrink-0">
                          {initials}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[#191B23]">{client.name}</div>
                          {client.is_vip && <span className="text-xs text-yellow-700">VIP</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-sm text-[#434654]">{(client as Client & { company?: { name: string } }).company?.name || '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="space-y-0.5">
                        {client.primary_phone && (
                          <div className="flex items-center gap-1 text-xs text-[#434654]">
                            <Phone className="w-3 h-3" />{client.primary_phone}
                          </div>
                        )}
                        {client.primary_email && (
                          <div className="flex items-center gap-1 text-xs text-[#434654]">
                            <Mail className="w-3 h-3" />{client.primary_email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="text-xs capitalize">{client.client_type}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
