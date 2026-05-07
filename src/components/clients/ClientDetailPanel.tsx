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
import { Phone, Mail, MapPin, Plus, X, UserCheck, Pencil, Trash2 } from 'lucide-react'
import { useClientBookings } from '@/hooks/useBookings'
import { useClient, useUpdateClient } from '@/hooks/useClients'
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

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: () => fetch('/api/companies').then(r => r.json()),
    enabled: showEdit,
  })

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
        <SheetContent className="w-full sm:w-[440px] px-6 py-0 gap-0" showCloseButton={false}>
          {/* Sticky Header */}
          <div className="flex-shrink-0 pt-5 pb-4 border-b border-[#EEEEF5]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-full bg-[#D4DCFF] flex items-center justify-center text-lg font-semibold text-[#1A56DB] shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-[#191B23] leading-tight truncate">{client.name}</h2>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-xs capitalize">{client.client_type}</Badge>
                    {client.is_verified && <Badge className="bg-green-100 text-green-700 text-xs">Verified</Badge>}
                    {client.is_vip && <Badge className="bg-yellow-100 text-yellow-700 text-xs">VIP</Badge>}
                  </div>
                  {client.client_type === 'guest' && client.guest_of_company && (
                    <p className="text-xs text-[#92400E] mt-1">Guest of {client.guest_of_company.name}</p>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={onClose} className="shrink-0 mt-0.5 text-[#737686] hover:text-[#191B23]">
                <X className="w-4 h-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto py-4 space-y-4">

            {/* Contact Details */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-label-caps text-[#737686]">Contact Details</h3>
                <Button
                  variant="ghost" size="sm"
                  className="h-6 text-xs text-[#1A56DB] gap-1 -mr-1"
                  onClick={() => setShowAddContact(true)}
                >
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </div>
              <div className="space-y-2.5">
                {client.primary_phone && (
                  <a href={`tel:${client.primary_phone}`} className="flex items-center gap-2.5 text-sm text-[#191B23] hover:text-[#1A56DB] transition-colors">
                    <Phone className="w-4 h-4 text-[#737686] shrink-0" />
                    <span>{client.primary_phone}</span>
                    <span className="text-xs text-[#9CA3AF]">primary</span>
                  </a>
                )}
                {client.primary_email && (
                  <a href={`mailto:${client.primary_email}`} className="flex items-center gap-2.5 text-sm text-[#191B23] hover:text-[#1A56DB] transition-colors min-w-0">
                    <Mail className="w-4 h-4 text-[#737686] shrink-0" />
                    <span className="truncate">{client.primary_email}</span>
                    <span className="text-xs text-[#9CA3AF] shrink-0">primary</span>
                  </a>
                )}
                {liveContacts.map(ct => (
                  <div key={ct.id} className="flex items-center gap-2 text-sm text-[#434654] group">
                    {ct.contact_type === 'phone'
                      ? <Phone className="w-4 h-4 text-[#737686] shrink-0" />
                      : <Mail className="w-4 h-4 text-[#737686] shrink-0" />}
                    <span className="truncate flex-1">{ct.value}</span>
                    <span className="text-xs text-[#737686] shrink-0">({ct.role})</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => openEditContact(ct)}
                        className="p-1 rounded text-[#737686] hover:text-[#1A56DB] hover:bg-[#EBF5FF] transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteContact(ct.id)}
                        disabled={deletingContactId === ct.id}
                        className="p-1 rounded text-[#737686] hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
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
                  <h3 className="text-label-caps text-[#737686] mb-2">Company</h3>
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
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-label-caps text-[#737686]">Saved Locations</h3>
                <Button
                  variant="ghost" size="sm"
                  className="h-6 text-xs text-[#1A56DB] gap-1 -mr-1"
                  onClick={() => setShowAddLocation(true)}
                >
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </div>
              {!liveLocations.length ? (
                <p className="text-xs text-[#737686]">No saved locations</p>
              ) : (
                <div className="space-y-2">
                  {liveLocations.map(loc => (
                    <div key={loc.id} className="flex items-start gap-2 text-sm group">
                      <MapPin className="w-4 h-4 text-[#737686] mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-[#191B23] capitalize">{loc.keyword}</span>
                        <p className="text-xs text-[#434654] mt-0.5 break-words">{loc.address}</p>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                        <button
                          onClick={() => openEditLocation(loc)}
                          className="p-1 rounded text-[#737686] hover:text-[#1A56DB] hover:bg-[#EBF5FF] transition-colors"
                          title="Edit location"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteLocation(loc.id)}
                          disabled={deletingLocationId === loc.id}
                          className="p-1 rounded text-[#737686] hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                          title="Delete location"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Separator />

            {/* Bookings */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-label-caps text-[#737686]">
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
                      className="flex items-center justify-between p-3 rounded-lg border border-[#C3C5D7] hover:bg-[#F3F3FE] hover:border-[#1A56DB]/30 transition-colors group"
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
          <div className="flex-shrink-0 py-4 border-t border-[#EEEEF5] flex gap-2 flex-wrap">
            <ButtonLink
              href={`/bookings/new?client_id=${client.id}`}
              size="sm"
              className="flex-1 bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm text-xs text-center"
            >
              Book Cab
            </ButtonLink>
            {client.client_type === 'guest' && (
              <Button
                size="sm" variant="outline"
                className="rounded-sm text-xs px-3 text-[#7E3AF2] border-[#7E3AF2] hover:bg-[#EDE9FE]"
                onClick={() => setShowPromote(true)}
              >
                <UserCheck className="w-3.5 h-3.5 mr-1" /> Promote
              </Button>
            )}
            <Button
              variant="outline" size="sm"
              className="rounded-sm text-xs px-4 gap-1"
              onClick={openEdit}
            >
              <Pencil className="w-3 h-3" /> Edit
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Edit Client ── */}
      <Dialog open={showEdit} onOpenChange={o => { if (!o && !saving) setShowEdit(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Client</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block">Name *</Label>
              <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="border-[#C3C5D7]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block">Primary Phone</Label>
                <Input value={editForm.primary_phone} onChange={e => setEditForm(p => ({ ...p, primary_phone: e.target.value }))} className="border-[#C3C5D7]" placeholder="+91 98000 00000" />
              </div>
              <div>
                <Label className="mb-1 block">Primary Email</Label>
                <Input type="email" value={editForm.primary_email} onChange={e => setEditForm(p => ({ ...p, primary_email: e.target.value }))} className="border-[#C3C5D7]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block">Designation</Label>
                <Input value={editForm.designation} onChange={e => setEditForm(p => ({ ...p, designation: e.target.value }))} className="border-[#C3C5D7]" placeholder="e.g. Manager" />
              </div>
              <div>
                <Label className="mb-1 block">Type</Label>
                <Select value={editForm.client_type} onValueChange={v => v && setEditForm(p => ({ ...p, client_type: v }))}>
                  <SelectTrigger className="border-[#C3C5D7]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corporate">Corporate</SelectItem>
                    <SelectItem value="walkin">Walk-in</SelectItem>
                    <SelectItem value="guest">Guest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-1 block">Company</Label>
              <Select value={editForm.company_id || '__none__'} onValueChange={v => v !== null && setEditForm(p => ({ ...p, company_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger className="border-[#C3C5D7]"><SelectValue placeholder="No company" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No company</SelectItem>
                  {companies.map(co => <SelectItem key={co.id} value={co.id}>{co.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)} disabled={saving}>Cancel</Button>
            <Button className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm" onClick={handleEdit} disabled={saving || !editForm.name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
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
