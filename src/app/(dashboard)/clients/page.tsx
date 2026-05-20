'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useClients, useCreateClient } from '@/hooks/useClients'
import { useCanEdit } from '@/hooks/useCurrentUser'
import { ClientDetailPanel } from '@/components/clients/ClientDetailPanel'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search, Plus, Phone, Mail, User, Briefcase } from 'lucide-react'
import { normalizePhone } from '@/lib/utils/phone'
import { CompanyCombobox } from '@/components/shared/CompanyCombobox'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { Client, Company } from '@/types'

const clientSchema = z.object({
  name: z.string().min(2),
  primary_phone: z.string().min(8).optional().or(z.literal('')),
  primary_email: z.string().email().optional().or(z.literal('')),
  client_type: z.enum(['corporate', 'walkin']),
  designation: z.string().optional(),
  company_id: z.string().optional(),
})

type ClientFormData = z.infer<typeof clientSchema>

export default function ClientsPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const { data: clients = [], isLoading, isError } = useClients(search || undefined)
  const createClient = useCreateClient()
  const canEdit = useCanEdit()

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: () => fetch('/api/companies').then(r => r.json()),
    enabled: showAddModal,
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: { client_type: 'corporate' },
  })
  const watchedType = watch('client_type', 'corporate')

  const CLIENT_TYPE_CONFIG = {
    corporate: { gradient: 'from-[#1A56DB] to-[#6366F1]',    label: 'Corporate', desc: 'Company-linked with approval routing', icon: Briefcase },
    walkin:    { gradient: 'from-emerald-500 to-teal-500',    label: 'Walk-in',   desc: 'One-time client, no company required', icon: User      },
  }

  const filtered = typeFilter === 'all' ? clients : clients.filter(c => c.client_type === typeFilter)

  async function onSubmit(data: ClientFormData) {
    try {
      await createClient.mutateAsync({
        ...data,
        company_id: data.company_id || undefined,
      })
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
        actions={canEdit ? (
          <Button
            size="sm"
            className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm gap-1.5"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="w-4 h-4" /> Add Client
          </Button>
        ) : undefined}
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
                        <a href={`tel:${client.primary_phone}`} onClick={e => e.stopPropagation()} className="truncate hover:underline hover:text-[#1A56DB]">{client.primary_phone}</a>
                        <a href={`https://wa.me/${client.primary_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="shrink-0 text-[#25D366] hover:text-[#128C7E]" title="WhatsApp">
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        </a>
                      </div>
                    )}
                    {client.primary_email && (
                      <div className="flex items-center gap-2 text-xs text-[#434654]">
                        <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                          <Mail className="w-3 h-3 text-[#1A56DB]" />
                        </div>
                        <a href={`mailto:${client.primary_email}`} onClick={e => e.stopPropagation()} className="truncate hover:underline hover:text-[#1A56DB]">{client.primary_email}</a>
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

      <Dialog open={showAddModal} onOpenChange={open => { setShowAddModal(open); if (!open) reset() }}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl gap-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Add Client</DialogTitle>
          </DialogHeader>

          {/* Gradient header — changes with client type */}
          <div className={`bg-gradient-to-br ${CLIENT_TYPE_CONFIG[watchedType as keyof typeof CLIENT_TYPE_CONFIG]?.gradient ?? 'from-[#1A56DB] to-[#6366F1]'} px-5 pt-5 pb-6`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="text-white">
                <p className="text-[11px] font-medium text-white/60 uppercase tracking-wider">New Client</p>
                <h2 className="text-xl font-bold mt-0.5">Add to directory</h2>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white/20 border-2 border-white/40 flex items-center justify-center shrink-0">
                <User className="w-6 h-6 text-white/60" />
              </div>
            </div>

            {/* Type pills */}
            <div className="flex gap-2">
              {(Object.entries(CLIENT_TYPE_CONFIG) as [string, typeof CLIENT_TYPE_CONFIG[keyof typeof CLIENT_TYPE_CONFIG]][]).map(([type, cfg]) => {
                const TypeIcon = cfg.icon
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setValue('client_type', type as 'corporate' | 'walkin')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      watchedType === type
                        ? 'bg-white text-[#191B23] shadow-md'
                        : 'bg-white/20 text-white/80 hover:bg-white/30 hover:text-white'
                    }`}
                  >
                    <TypeIcon className="w-3 h-3" />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="px-5 py-4 space-y-4">
            {/* Type description */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F8F9FF] border border-[#E5E7EB]">
              {(() => { const TypeIcon = CLIENT_TYPE_CONFIG[watchedType as keyof typeof CLIENT_TYPE_CONFIG]?.icon ?? User; return <TypeIcon className="w-3.5 h-3.5 text-[#737686] mt-0.5 shrink-0" /> })()}
              <p className="text-xs text-[#434654] leading-relaxed">{CLIENT_TYPE_CONFIG[watchedType as keyof typeof CLIENT_TYPE_CONFIG]?.desc}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#434654]">Full Name *</Label>
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
                <Input {...register('name')} placeholder="Client name" className="pl-8 border-[#C3C5D7] h-9 text-sm" />
              </div>
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#434654]">Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
                  <Input {...register('primary_phone')} onBlur={e => setValue('primary_phone', normalizePhone(e.target.value))} placeholder="91XXXXXXXXXX" className="pl-8 border-[#C3C5D7] h-9 text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#434654]">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
                  <Input {...register('primary_email')} type="email" placeholder="client@co.com" className="pl-8 border-[#C3C5D7] h-9 text-sm" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#434654]">Designation</Label>
                <div className="relative">
                  <Briefcase className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
                  <Input {...register('designation')} placeholder="e.g. Manager" className="pl-8 border-[#C3C5D7] h-9 text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#434654]">Company</Label>
                <CompanyCombobox
                  value={watch('company_id') || ''}
                  companies={companies}
                  onChange={id => setValue('company_id', id || undefined)}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1 border-t border-[#F3F4F6]">
              <Button type="button" variant="outline" onClick={() => setShowAddModal(false)} className="flex-1">Cancel</Button>
              <Button
                type="submit"
                disabled={createClient.isPending}
                className={`flex-1 bg-gradient-to-r ${CLIENT_TYPE_CONFIG[watchedType as keyof typeof CLIENT_TYPE_CONFIG]?.gradient ?? 'from-[#1A56DB] to-[#6366F1]'} hover:opacity-90 transition-opacity rounded-sm text-white border-0 shadow-sm`}
              >
                {createClient.isPending ? 'Adding…' : 'Add Client'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
