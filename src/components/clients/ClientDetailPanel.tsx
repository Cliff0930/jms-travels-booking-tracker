'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ButtonLink } from '@/components/ui/button-link'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Phone, Mail, MapPin, Plus, X, UserCheck, Pencil, Trash2, GitMerge, Briefcase, User } from 'lucide-react'
import { CompanyCombobox } from '@/components/shared/CompanyCombobox'
import { useClientBookings } from '@/hooks/useBookings'
import { useClient, useUpdateClient } from '@/hooks/useClients'
import { useCanEdit } from '@/hooks/useCurrentUser'
import { BookingStatusBadge } from '@/components/shared/StatusBadge'
import { formatBookingDateTime } from '@/lib/utils/date'
import { toast } from 'sonner'
import type { Booking, Client, ClientType, Company } from '@/types'

interface ClientDetailPanelProps {
  client: Client | null
  open: boolean
  onClose: () => void
}

type ClientWithExtras = Client & {
  contacts?: Array<{ id: string; value: string; contact_type: string; role: string }>
  locations?: Array<{ id: string; keyword: string; address: string }>
}

export function ClientDetailPanel({ client, open, onClose }: ClientDetailPanelProps) {
  const qc = useQueryClient()
  const { data: clientBookings = [] } = useClientBookings(client?.id)
  const { data: fullClient } = useClient(client?.id ?? '')
  const updateClient = useUpdateClient()

  // Booking tab
  const [bookingTab, setBookingTab] = useState<'all' | 'company' | 'personal'>('all')

  // Edit client dialog
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', primary_phone: '', primary_email: '', designation: '', client_type: 'corporate', company_id: '' })
  const [saving, setSaving] = useState(false)

  // Add contact dialog
  const [showAddContact, setShowAddContact] = useState(false)
  const [contactType, setContactType] = useState<'phone' | 'email'>('phone')
  const [contactValue, setContactValue] = useState('')
  const [savingContact, setSavingContact] = useState(false)

  // Add location dialog
  const [showAddLocation, setShowAddLocation] = useState(false)
  const [locKeyword, setLocKeyword] = useState('')
  const [locAddress, setLocAddress] = useState('')
  const [savingLocation, setSavingLocation] = useState(false)

  // Edit / delete contact
  const [editingContact, setEditingContact] = useState<{ id: string; value: string; contact_type: string; role: string } | null>(null)
  const [editContactValue, setEditContactValue] = useState('')
  const [editContactType, setEditContactType] = useState<'phone' | 'email'>('phone')
  const [savingEditContact, setSavingEditContact] = useState(false)
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null)

  // Edit location dialog
  const [editingLocation, setEditingLocation] = useState<{ id: string; keyword: string; address: string } | null>(null)
  const [editLocKeyword, setEditLocKeyword] = useState('')
  const [editLocAddress, setEditLocAddress] = useState('')
  const [savingEditLocation, setSavingEditLocation] = useState(false)
  const [deletingLocationId, setDeletingLocationId] = useState<string | null>(null)

  // Promote to client dialog
  const [showPromote, setShowPromote] = useState(false)
  const [promoteType, setPromoteType] = useState<'corporate' | 'walkin'>('corporate')

  // Merge dialog
  const [showMerge, setShowMerge] = useState(false)
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeResults, setMergeResults] = useState<Client[]>([])
  const [selectedMergeClient, setSelectedMergeClient] = useState<Client | null>(null)
  const [merging, setMerging] = useState(false)

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: () => fetch('/api/companies').then(r => r.json()),
    enabled: showEdit,
  })

  const canEdit = useCanEdit()

  if (!client) return null

  // Use fullClient (detail endpoint) for contacts/locations — prop only has list-level data
  const liveContacts = (fullClient as ClientWithExtras | undefined)?.contacts ?? []
  const liveLocations = (fullClient as ClientWithExtras | undefined)?.locations ?? []
  const initials = client.name.split(' ').map(n => n[0]).slice(0, 2).join('')

  const companyBookings  = clientBookings.filter((b: Booking) => b.booking_type === 'company')
  const personalBookings = clientBookings.filter((b: Booking) => b.booking_type === 'personal')
  const visibleBookings  = bookingTab === 'company' ? companyBookings
                         : bookingTab === 'personal' ? personalBookings
                         : clientBookings

  function openEdit() {
    setEditForm({
      name: client!.name,
      primary_phone: client!.primary_phone || '',
      primary_email: client!.primary_email || '',
      designation: client!.designation || '',
      client_type: client!.client_type,
      company_id: client!.company_id || '',
    })
    setShowEdit(true)
  }

  async function handleEdit() {
    setSaving(true)
    try {
      await updateClient.mutateAsync({
        id: client!.id,
        data: {
          name: editForm.name.trim(),
          primary_phone: editForm.primary_phone.trim() || null,
          primary_email: editForm.primary_email.trim() || null,
          designation: editForm.designation.trim() || null,
          client_type: editForm.client_type as ClientType,
          company_id: editForm.company_id || null,
        },
      })
      toast.success('Client updated')
      setShowEdit(false)
    } catch {
      toast.error('Failed to update client')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddContact() {
    if (!contactValue.trim()) return
    setSavingContact(true)
    try {
      const res = await fetch(`/api/clients/${client!.id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: contactValue.trim(), contact_type: contactType }),
      })
      if (!res.ok) throw new Error()
      await qc.refetchQueries({ queryKey: ['clients', client!.id] })
      toast.success(`${contactType === 'phone' ? 'Phone' : 'Email'} added`)
      setContactValue('')
      setShowAddContact(false)
    } catch {
      toast.error('Failed to add contact')
    } finally {
      setSavingContact(false)
    }
  }

  async function handleAddLocation() {
    if (!locKeyword.trim() || !locAddress.trim()) return
    setSavingLocation(true)
    try {
      const res = await fetch(`/api/clients/${client!.id}/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: locKeyword, address: locAddress }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      await qc.refetchQueries({ queryKey: ['clients', client!.id] })
      toast.success('Location saved')
      setLocKeyword('')
      setLocAddress('')
      setShowAddLocation(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save location')
    } finally {
      setSavingLocation(false)
    }
  }

  function openEditContact(ct: { id: string; value: string; contact_type: string; role: string }) {
    setEditingContact(ct)
    setEditContactValue(ct.value)
    setEditContactType(ct.contact_type as 'phone' | 'email')
  }

  async function handleEditContact() {
    if (!editingContact || !editContactValue.trim()) return
    setSavingEditContact(true)
    try {
      const res = await fetch(`/api/clients/${client!.id}/contacts/${editingContact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: editContactValue.trim(), contact_type: editContactType }),
      })
      if (!res.ok) throw new Error()
      await qc.refetchQueries({ queryKey: ['clients', client!.id] })
      toast.success('Contact updated')
      setEditingContact(null)
    } catch {
      toast.error('Failed to update contact')
    } finally {
      setSavingEditContact(false)
    }
  }

  async function handleDeleteContact(contactId: string) {
    setDeletingContactId(contactId)
    try {
      const res = await fetch(`/api/clients/${client!.id}/contacts/${contactId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      await qc.refetchQueries({ queryKey: ['clients', client!.id] })
      toast.success('Contact removed')
    } catch {
      toast.error('Failed to remove contact')
    } finally {
      setDeletingContactId(null)
    }
  }

  function openEditLocation(loc: { id: string; keyword: string; address: string }) {
    setEditingLocation(loc)
    setEditLocKeyword(loc.keyword)
    setEditLocAddress(loc.address)
  }

  async function handleEditLocation() {
    if (!editingLocation || !editLocKeyword.trim() || !editLocAddress.trim()) return
    setSavingEditLocation(true)
    try {
      const res = await fetch(`/api/clients/${client!.id}/locations/${editingLocation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: editLocKeyword, address: editLocAddress }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      await qc.refetchQueries({ queryKey: ['clients', client!.id] })
      toast.success('Location updated')
      setEditingLocation(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update location')
    } finally {
      setSavingEditLocation(false)
    }
  }

  async function handleDeleteLocation(locationId: string) {
    setDeletingLocationId(locationId)
    try {
      const res = await fetch(`/api/clients/${client!.id}/locations/${locationId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      await qc.refetchQueries({ queryKey: ['clients', client!.id] })
      toast.success('Location removed')
    } catch {
      toast.error('Failed to remove location')
    } finally {
      setDeletingLocationId(null)
    }
  }

  async function searchForMerge(q: string) {
    setMergeSearch(q)
    if (q.length < 2) { setMergeResults([]); return }
    const res = await fetch(`/api/clients?q=${encodeURIComponent(q)}`)
    if (!res.ok) return
    const data: Client[] = await res.json()
    setMergeResults(data.filter(c => c.id !== client!.id))
  }

  function resetMergeDialog() {
    setShowMerge(false)
    setMergeSearch('')
    setMergeResults([])
    setSelectedMergeClient(null)
  }

  async function handleMerge() {
    if (!selectedMergeClient) return
    setMerging(true)
    try {
      const res = await fetch(`/api/clients/${client!.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merge_from_id: selectedMergeClient.id }),
      })
      if (!res.ok) throw new Error()
      await qc.refetchQueries({ queryKey: ['clients', client!.id] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success(`Merged ${selectedMergeClient.name} into ${client!.name}`)
      resetMergeDialog()
    } catch {
      toast.error('Failed to merge clients')
    } finally {
      setMerging(false)
    }
  }

  async function handlePromote() {
    try {
      await updateClient.mutateAsync({ id: client!.id, data: { client_type: promoteType as ClientType } })
      toast.success(`${client!.name} promoted to ${promoteType} client`)
      setShowPromote(false)
    } catch {
      toast.error('Failed to promote client')
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={o => !o && onClose()}>
        <SheetContent className="w-full md:w-3/4 lg:w-1/2 px-0 py-0 gap-0" showCloseButton={false}>
          {/* Gradient Header */}
          <div className="flex-shrink-0 bg-gradient-to-br from-[#1A56DB] to-[#6366F1] pt-5 pb-5 px-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-xl font-bold text-white shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-white leading-tight truncate">{client.name}</h2>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[11px] font-medium bg-white/20 text-white px-2 py-0.5 rounded-full capitalize">{client.client_type}</span>
                    {client.is_verified && <span className="text-[11px] font-medium bg-emerald-400/30 text-emerald-100 px-2 py-0.5 rounded-full">✓ Verified</span>}
                    {client.is_vip && <span className="text-[11px] font-medium bg-amber-400/30 text-amber-100 px-2 py-0.5 rounded-full">★ VIP</span>}
                  </div>
                  {client.client_type === 'guest' && client.guest_of_company && (
                    <p className="text-xs text-white/70 mt-1">Guest of {client.guest_of_company.name}</p>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={onClose} className="shrink-0 mt-0.5 text-white/80 hover:text-white hover:bg-white/20">
                <X className="w-4 h-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto py-4 px-6 space-y-4">

            {/* Contact Details */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A56DB]">Contact Details</h3>
                {canEdit && (
                  <Button
                    variant="ghost" size="sm"
                    className="h-6 text-xs text-[#1A56DB] gap-1 -mr-1 hover:bg-blue-50"
                    onClick={() => setShowAddContact(true)}
                  >
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {client.primary_phone && (
                  <a href={`tel:${client.primary_phone}`} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-blue-50 border border-blue-100 hover:border-blue-300 text-sm text-[#191B23] hover:text-[#1A56DB] transition-all group">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <Phone className="w-3.5 h-3.5 text-[#1A56DB]" />
                    </div>
                    <span className="flex-1 font-medium">{client.primary_phone}</span>
                    <span className="text-[10px] font-semibold text-blue-400 bg-blue-100 px-1.5 py-0.5 rounded-full">primary</span>
                  </a>
                )}
                {client.primary_email && (
                  <a href={`mailto:${client.primary_email}`} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-blue-50 border border-blue-100 hover:border-blue-300 text-sm text-[#191B23] hover:text-[#1A56DB] transition-all min-w-0">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <Mail className="w-3.5 h-3.5 text-[#1A56DB]" />
                    </div>
                    <span className="truncate flex-1 font-medium">{client.primary_email}</span>
                    <span className="text-[10px] font-semibold text-blue-400 bg-blue-100 px-1.5 py-0.5 rounded-full shrink-0">primary</span>
                  </a>
                )}
                {liveContacts.map(ct => (
                  <div key={ct.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-blue-50 border border-blue-100 hover:border-blue-200 text-sm text-[#434654] group transition-all">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      {ct.contact_type === 'phone'
                        ? <Phone className="w-3.5 h-3.5 text-[#1A56DB]" />
                        : <Mail className="w-3.5 h-3.5 text-[#1A56DB]" />}
                    </div>
                    <span className="truncate flex-1 font-medium">{ct.value}</span>
                    <span className="text-[10px] text-[#737686] shrink-0">({ct.role})</span>
                    {canEdit && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => openEditContact(ct)}
                        className="p-1 rounded text-[#737686] hover:text-[#1A56DB] hover:bg-white transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteContact(ct.id)}
                        disabled={deletingContactId === ct.id}
                        className="p-1 rounded text-[#737686] hover:text-red-600 hover:bg-white transition-colors disabled:opacity-40"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    )}
                  </div>
                ))}
                {!client.primary_phone && !client.primary_email && !liveContacts.length && (
                  <p className="text-xs text-[#737686]">No contacts on file</p>
                )}
              </div>
            </section>

            {/* Company / Guest origin */}
            {(client.company || client.designation || client.guest_of_company) && (
              <>
                <Separator />
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#6366F1] mb-2">Company</h3>
                  {client.client_type === 'guest' && client.guest_of_company ? (
                    <div>
                      <p className="text-xs text-[#737686] mb-0.5">Guest of</p>
                      <p className="text-sm font-medium text-[#92400E]">{client.guest_of_company.name}</p>
                    </div>
                  ) : (
                    client.company && <p className="text-sm font-medium text-[#191B23]">{client.company.name}</p>
                  )}
                  {client.designation && <p className="text-xs text-[#434654] mt-0.5">{client.designation}</p>}
                </section>
              </>
            )}

            <Separator />

            {/* Saved Locations */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#7C3AED]">Saved Locations</h3>
                {canEdit && (
                  <Button
                    variant="ghost" size="sm"
                    className="h-6 text-xs text-[#7C3AED] gap-1 -mr-1 hover:bg-violet-50"
                    onClick={() => setShowAddLocation(true)}
                  >
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                )}
              </div>
              {!liveLocations.length ? (
                <p className="text-xs text-[#737686]">No saved locations</p>
              ) : (
                <div className="space-y-2">
                  {liveLocations.map(loc => (
                    <div key={loc.id} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-violet-50 border border-violet-100 hover:border-violet-300 text-sm group transition-all">
                      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-[#7C3AED]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-[#191B23] capitalize">{loc.keyword}</span>
                        <p className="text-xs text-[#434654] mt-0.5 break-words">{loc.address}</p>
                      </div>
                      {canEdit && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                        <button
                          onClick={() => openEditLocation(loc)}
                          className="p-1 rounded text-[#737686] hover:text-[#7C3AED] hover:bg-white transition-colors"
                          title="Edit location"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteLocation(loc.id)}
                          disabled={deletingLocationId === loc.id}
                          className="p-1 rounded text-[#737686] hover:text-red-600 hover:bg-white transition-colors disabled:opacity-40"
                          title="Delete location"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Separator />

            {/* Bookings */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#059669]">
                  Bookings {clientBookings.length > 0 && `(${clientBookings.length})`}
                </h3>
                {/* Booking type tabs */}
                <div className="flex rounded-md border border-[#C3C5D7] overflow-hidden text-[10px]">
                  {([
                    { key: 'all',      label: 'All',      count: clientBookings.length },
                    { key: 'company',  label: 'Company',  count: companyBookings.length },
                    { key: 'personal', label: 'Personal', count: personalBookings.length },
                  ] as const).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setBookingTab(tab.key)}
                      className={`px-2.5 h-6 border-r last:border-r-0 border-[#C3C5D7] transition-colors ${
                        bookingTab === tab.key ? 'bg-[#1A56DB] text-white border-r-[#1A56DB]' : 'bg-white text-[#434654] hover:bg-[#F3F3FE]'
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>
              </div>
              {visibleBookings.length === 0 ? (
                <p className="text-xs text-[#737686]">
                  {bookingTab === 'all' ? 'No bookings yet' : `No ${bookingTab} bookings`}
                </p>
              ) : (
                <div className="space-y-2">
                  {visibleBookings.slice(0, 10).map((b: Booking) => (
                    <a
                      key={b.id}
                      href={`/bookings/${b.id}`}
                      className="flex items-center justify-between p-3 rounded-xl border border-[#E5E7EB] hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:border-[#1A56DB]/40 hover:shadow-sm transition-all group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-[#191B23] group-hover:text-[#1A56DB]">{b.booking_ref}</span>
                          {b.booking_type ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              b.booking_type === 'company'
                                ? 'bg-[#EBF5FF] text-[#1A56DB]'
                                : 'bg-[#F0FDF4] text-green-700'
                            }`}>
                              {b.booking_type}
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F3F4F6] text-[#9CA3AF]">unclassified</span>
                          )}
                        </div>
                        <div className="text-xs text-[#737686] mt-0.5 truncate">
                          {formatBookingDateTime(b.pickup_date, null)}
                          {b.pickup_location && ` · ${b.pickup_location.slice(0, 28)}${b.pickup_location.length > 28 ? '…' : ''}`}
                        </div>
                      </div>
                      <div className="ml-2 shrink-0">
                        <BookingStatusBadge status={b.status} />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Sticky Footer */}
          <div className="flex-shrink-0 py-4 px-6 border-t border-[#EEEEF5] flex gap-2 flex-wrap">
            {canEdit && (
              <ButtonLink
                href={`/bookings/new?client_id=${client.id}`}
                size="sm"
                className="flex-1 bg-gradient-to-r from-[#1A56DB] to-[#6366F1] hover:from-[#1648c5] hover:to-[#4F46E5] rounded-sm text-xs text-center shadow-sm"
              >
                Book Cab
              </ButtonLink>
            )}
            {canEdit && client.client_type === 'guest' && (
              <Button
                size="sm" variant="outline"
                className="rounded-sm text-xs px-3 text-[#7E3AF2] border-[#7E3AF2] hover:bg-[#EDE9FE]"
                onClick={() => setShowPromote(true)}
              >
                <UserCheck className="w-3.5 h-3.5 mr-1" /> Promote
              </Button>
            )}
            {canEdit && (
              <Button
                variant="outline" size="sm"
                className="rounded-sm text-xs px-3 gap-1 text-[#737686]"
                onClick={() => setShowMerge(true)}
              >
                <GitMerge className="w-3 h-3" /> Merge
              </Button>
            )}
            {canEdit && (
              <Button
                variant="outline" size="sm"
                className="rounded-sm text-xs px-4 gap-1"
                onClick={openEdit}
              >
                <Pencil className="w-3 h-3" /> Edit
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Edit Client ── */}
      <Dialog open={showEdit} onOpenChange={o => { if (!o && !saving) setShowEdit(false) }}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl gap-0">
          <DialogHeader className="sr-only"><DialogTitle>Edit Client</DialogTitle></DialogHeader>

          {/* Gradient header */}
          <div className={`px-5 pt-5 pb-6 ${
            editForm.client_type === 'walkin' ? 'bg-gradient-to-br from-emerald-500 to-teal-500' : 'bg-gradient-to-br from-[#1A56DB] to-[#6366F1]'
          }`}>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 border-2 border-white/40 flex items-center justify-center text-lg font-bold text-white shrink-0">
                {editForm.name ? editForm.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() : '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-white/60 uppercase tracking-wider">Editing</p>
                <h2 className="text-lg font-bold text-white mt-0.5 truncate">{editForm.name || 'Client'}</h2>
                <div className="flex gap-1.5 mt-2">
                  {(['corporate', 'walkin'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEditForm(p => ({ ...p, client_type: t }))}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all capitalize ${
                        editForm.client_type === t
                          ? 'bg-white text-[#191B23] shadow-sm'
                          : 'bg-white/20 text-white/80 hover:bg-white/30'
                      }`}
                    >
                      {t === 'walkin' ? 'Walk-in' : 'Corporate'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#434654]">Full Name *</Label>
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
                <Input
                  value={editForm.name}
                  onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                  className="pl-8 border-[#C3C5D7] h-9 text-sm"
                  placeholder="Client name"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#434654]">Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
                  <Input
                    value={editForm.primary_phone}
                    onChange={e => setEditForm(p => ({ ...p, primary_phone: e.target.value }))}
                    className="pl-8 border-[#C3C5D7] h-9 text-sm"
                    placeholder="+91 98000…"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#434654]">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
                  <Input
                    type="email"
                    value={editForm.primary_email}
                    onChange={e => setEditForm(p => ({ ...p, primary_email: e.target.value }))}
                    className="pl-8 border-[#C3C5D7] h-9 text-sm"
                    placeholder="email@co.com"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#434654]">Designation</Label>
                <div className="relative">
                  <Briefcase className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
                  <Input
                    value={editForm.designation}
                    onChange={e => setEditForm(p => ({ ...p, designation: e.target.value }))}
                    className="pl-8 border-[#C3C5D7] h-9 text-sm"
                    placeholder="e.g. Manager"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#434654]">Company</Label>
                <CompanyCombobox
                  value={editForm.company_id || ''}
                  companies={companies}
                  onChange={id => setEditForm(p => ({ ...p, company_id: id }))}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1 border-t border-[#F3F4F6]">
              <Button variant="outline" className="flex-1" onClick={() => setShowEdit(false)} disabled={saving}>Cancel</Button>
              <Button
                className={`flex-1 rounded-sm text-white border-0 shadow-sm ${
                  editForm.client_type === 'walkin'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90'
                    : 'bg-gradient-to-r from-[#1A56DB] to-[#6366F1] hover:opacity-90'
                }`}
                onClick={handleEdit}
                disabled={saving || !editForm.name.trim()}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Contact ── */}
      <Dialog open={showAddContact} onOpenChange={o => { if (!o) { setShowAddContact(false); setContactValue('') } }}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block">Type</Label>
              <div className="flex rounded-md border border-[#C3C5D7] overflow-hidden">
                <button onClick={() => setContactType('phone')} className={`flex-1 h-8 text-sm transition-colors ${contactType === 'phone' ? 'bg-[#1A56DB] text-white' : 'bg-white text-[#434654] hover:bg-[#F3F3FE]'}`}>Phone</button>
                <button onClick={() => setContactType('email')} className={`flex-1 h-8 text-sm border-l border-[#C3C5D7] transition-colors ${contactType === 'email' ? 'bg-[#1A56DB] text-white' : 'bg-white text-[#434654] hover:bg-[#F3F3FE]'}`}>Email</button>
              </div>
            </div>
            <div>
              <Label className="mb-1 block">{contactType === 'phone' ? 'Phone Number' : 'Email Address'}</Label>
              <Input
                value={contactValue}
                onChange={e => setContactValue(e.target.value)}
                placeholder={contactType === 'phone' ? '+91 98000 00000' : 'email@example.com'}
                type={contactType === 'email' ? 'email' : 'tel'}
                className="border-[#C3C5D7]"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddContact(false); setContactValue('') }}>Cancel</Button>
            <Button className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm" onClick={handleAddContact} disabled={savingContact || !contactValue.trim()}>
              {savingContact ? 'Adding…' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Location ── */}
      <Dialog open={showAddLocation} onOpenChange={o => { if (!o) { setShowAddLocation(false); setLocKeyword(''); setLocAddress('') } }}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Save Location</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block">Label</Label>
              <Input value={locKeyword} onChange={e => setLocKeyword(e.target.value)} placeholder="e.g. Home, Office, Hotel" className="border-[#C3C5D7]" autoFocus />
            </div>
            <div>
              <Label className="mb-1 block">Address</Label>
              <Input value={locAddress} onChange={e => setLocAddress(e.target.value)} placeholder="Full address" className="border-[#C3C5D7]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddLocation(false); setLocKeyword(''); setLocAddress('') }}>Cancel</Button>
            <Button className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm" onClick={handleAddLocation} disabled={savingLocation || !locKeyword.trim() || !locAddress.trim()}>
              {savingLocation ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Merge Clients ── */}
      <Dialog open={showMerge} onOpenChange={o => { if (!o) resetMergeDialog() }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Merge Clients</DialogTitle></DialogHeader>
          {!selectedMergeClient ? (
            <div className="space-y-3">
              <p className="text-sm text-[#737686]">
                Search for the duplicate account to merge into <span className="font-medium text-[#191B23]">{client.name}</span>. Their bookings, contacts and locations will all move across.
              </p>
              <Input
                value={mergeSearch}
                onChange={e => searchForMerge(e.target.value)}
                placeholder="Search by name, phone or email…"
                className="border-[#C3C5D7]"
                autoFocus
              />
              {mergeResults.length > 0 && (
                <div className="border border-[#C3C5D7] rounded-md overflow-hidden max-h-48 overflow-y-auto">
                  {mergeResults.map(r => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedMergeClient(r)}
                      className="w-full text-left px-3 py-2.5 hover:bg-[#F3F3FE] border-b border-[#C3C5D7] last:border-0 transition-colors"
                    >
                      <div className="text-sm font-medium text-[#191B23]">{r.name}</div>
                      <div className="text-xs text-[#737686]">
                        {[r.primary_phone, r.primary_email].filter(Boolean).join(' · ')}
                        {r.primary_phone || r.primary_email ? '' : 'No contact info'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {mergeSearch.length >= 2 && mergeResults.length === 0 && (
                <p className="text-xs text-[#737686]">No other clients found</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800 mb-1.5">The following account will be permanently deleted:</p>
                <p className="text-sm font-medium text-amber-900">{selectedMergeClient.name}</p>
                {selectedMergeClient.primary_phone && <p className="text-xs text-amber-700 mt-0.5">{selectedMergeClient.primary_phone}</p>}
                {selectedMergeClient.primary_email && <p className="text-xs text-amber-700">{selectedMergeClient.primary_email}</p>}
              </div>
              <p className="text-sm text-[#737686]">
                All bookings, contacts and saved locations from <span className="font-medium text-[#434654]">{selectedMergeClient.name}</span> will move to <span className="font-medium text-[#191B23]">{client.name}</span>. This cannot be undone.
              </p>
            </div>
          )}
          <DialogFooter>
            {!selectedMergeClient ? (
              <Button variant="outline" onClick={resetMergeDialog}>Cancel</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setSelectedMergeClient(null)} disabled={merging}>Back</Button>
                <Button className="bg-red-600 hover:bg-red-700 rounded-sm" onClick={handleMerge} disabled={merging}>
                  {merging ? 'Merging…' : 'Confirm Merge'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Contact ── */}
      <Dialog open={!!editingContact} onOpenChange={o => { if (!o) setEditingContact(null) }}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Edit Contact</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block">Type</Label>
              <div className="flex rounded-md border border-[#C3C5D7] overflow-hidden">
                <button onClick={() => setEditContactType('phone')} className={`flex-1 h-8 text-sm transition-colors ${editContactType === 'phone' ? 'bg-[#1A56DB] text-white' : 'bg-white text-[#434654] hover:bg-[#F3F3FE]'}`}>Phone</button>
                <button onClick={() => setEditContactType('email')} className={`flex-1 h-8 text-sm border-l border-[#C3C5D7] transition-colors ${editContactType === 'email' ? 'bg-[#1A56DB] text-white' : 'bg-white text-[#434654] hover:bg-[#F3F3FE]'}`}>Email</button>
              </div>
            </div>
            <div>
              <Label className="mb-1 block">{editContactType === 'phone' ? 'Phone Number' : 'Email Address'}</Label>
              <Input
                value={editContactValue}
                onChange={e => setEditContactValue(e.target.value)}
                placeholder={editContactType === 'phone' ? '+91 98000 00000' : 'email@example.com'}
                type={editContactType === 'email' ? 'email' : 'tel'}
                className="border-[#C3C5D7]"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingContact(null)} disabled={savingEditContact}>Cancel</Button>
            <Button className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm" onClick={handleEditContact} disabled={savingEditContact || !editContactValue.trim()}>
              {savingEditContact ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Location ── */}
      <Dialog open={!!editingLocation} onOpenChange={o => { if (!o) setEditingLocation(null) }}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Edit Location</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block">Label</Label>
              <Input value={editLocKeyword} onChange={e => setEditLocKeyword(e.target.value)} placeholder="e.g. Home, Office, Hotel" className="border-[#C3C5D7]" autoFocus />
            </div>
            <div>
              <Label className="mb-1 block">Address</Label>
              <Input value={editLocAddress} onChange={e => setEditLocAddress(e.target.value)} placeholder="Full address" className="border-[#C3C5D7]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLocation(null)} disabled={savingEditLocation}>Cancel</Button>
            <Button className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm" onClick={handleEditLocation} disabled={savingEditLocation || !editLocKeyword.trim() || !editLocAddress.trim()}>
              {savingEditLocation ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Promote to Client ── */}
      <Dialog open={showPromote} onOpenChange={setShowPromote}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Promote {client.name} to Client</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {client.guest_of_company && (
              <p className="text-sm text-[#737686]">
                Originally a guest of <span className="font-medium text-[#434654]">{client.guest_of_company.name}</span>. This history is preserved.
              </p>
            )}
            <div>
              <Label className="mb-1 block">Client Type *</Label>
              <Select value={promoteType} onValueChange={v => v && setPromoteType(v as 'corporate' | 'walkin')}>
                <SelectTrigger className="border-[#C3C5D7]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corporate">Corporate</SelectItem>
                  <SelectItem value="walkin">Walk-in</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-[#737686]">You can update their company and contact details after promoting.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPromote(false)}>Cancel</Button>
            <Button className="bg-[#7E3AF2] hover:bg-[#6C2BD9] rounded-sm" onClick={handlePromote} disabled={updateClient.isPending}>
              {updateClient.isPending ? 'Promoting…' : 'Promote'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
