'use client'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ButtonLink } from '@/components/ui/button-link'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Phone, Mail, MapPin, Plus, X } from 'lucide-react'
import { useClientBookings } from '@/hooks/useBookings'
import { BookingStatusBadge } from '@/components/shared/StatusBadge'
import { formatBookingDateTime } from '@/lib/utils/date'
import type { Client } from '@/types'

interface ClientDetailPanelProps {
  client: Client | null
  open: boolean
  onClose: () => void
}

export function ClientDetailPanel({ client, open, onClose }: ClientDetailPanelProps) {
  const { data: clientBookings = [] } = useClientBookings(client?.id)

  if (!client) return null
  const initials = client.name.split(' ').map(n => n[0]).slice(0, 2).join('')
  const clientWithExtras = client as Client & {
    contacts?: Array<{ id: string; value: string; contact_type: string; role: string }>
    locations?: Array<{ id: string; keyword: string; address: string }>
  }

  const recentBookings = clientBookings.slice(0, 5)

  return (
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
          <section>
            <h3 className="text-label-caps text-[#737686] mb-2">Contact Details</h3>
            <div className="space-y-2.5">
              {client.primary_phone && (
                <a href={`tel:${client.primary_phone}`} className="flex items-center gap-2.5 text-sm text-[#191B23] hover:text-[#1A56DB] transition-colors">
                  <Phone className="w-4 h-4 text-[#737686] shrink-0" />
                  {client.primary_phone}
                </a>
              )}
              {client.primary_email && (
                <a href={`mailto:${client.primary_email}`} className="flex items-center gap-2.5 text-sm text-[#191B23] hover:text-[#1A56DB] transition-colors min-w-0">
                  <Mail className="w-4 h-4 text-[#737686] shrink-0" />
                  <span className="truncate">{client.primary_email}</span>
                </a>
              )}
              {clientWithExtras.contacts?.map(c => (
                <div key={c.id} className="flex items-center gap-2.5 text-sm text-[#434654] min-w-0">
                  {c.contact_type === 'phone'
                    ? <Phone className="w-4 h-4 text-[#737686] shrink-0" />
                    : <Mail className="w-4 h-4 text-[#737686] shrink-0" />}
                  <span className="truncate">{c.value}</span>
                  <span className="text-xs text-[#737686] shrink-0">({c.role})</span>
                </div>
              ))}
            </div>
          </section>

          {client.company && (
            <>
              <Separator />
              <section>
                <h3 className="text-label-caps text-[#737686] mb-2">Company</h3>
                <p className="text-sm font-medium text-[#191B23]">{client.company.name}</p>
                {client.designation && <p className="text-xs text-[#434654] mt-0.5">{client.designation}</p>}
              </section>
            </>
          )}

          <Separator />

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-label-caps text-[#737686]">Saved Locations</h3>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-[#1A56DB] gap-1 -mr-1">
                <Plus className="w-3 h-3" /> Add
              </Button>
            </div>
            {!clientWithExtras.locations?.length ? (
              <p className="text-xs text-[#737686]">No saved locations</p>
            ) : (
              <div className="space-y-2">
                {clientWithExtras.locations.map(loc => (
                  <div key={loc.id} className="flex items-start gap-2.5 text-sm">
                    <MapPin className="w-4 h-4 text-[#737686] mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-medium text-[#191B23] capitalize">{loc.keyword}</span>
                      <p className="text-xs text-[#434654] mt-0.5 break-words">{loc.address}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          <section>
            <h3 className="text-label-caps text-[#737686] mb-2">
              Recent Bookings {recentBookings.length > 0 && `(${recentBookings.length})`}
            </h3>
            {recentBookings.length === 0 ? (
              <p className="text-xs text-[#737686]">No bookings yet</p>
            ) : (
              <div className="space-y-2">
                {recentBookings.map(b => (
                  <a
                    key={b.id}
                    href={`/bookings/${b.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-[#C3C5D7] hover:bg-[#F3F3FE] hover:border-[#1A56DB]/30 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-[#191B23] group-hover:text-[#1A56DB]">
                        {b.booking_ref}
                      </div>
                      <div className="text-xs text-[#737686] mt-0.5 truncate">
                        {formatBookingDateTime(b.pickup_date, null)}
                        {b.pickup_location && ` · ${b.pickup_location.slice(0, 30)}${b.pickup_location.length > 30 ? '…' : ''}`}
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
        <div className="flex-shrink-0 py-4 border-t border-[#EEEEF5] flex gap-2">
          <ButtonLink
            href={`/bookings/new?client_id=${client.id}`}
            size="sm"
            className="flex-1 bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm text-xs text-center"
          >
            Book Cab
          </ButtonLink>
          <Button variant="outline" size="sm" className="rounded-sm text-xs px-5">Edit</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
