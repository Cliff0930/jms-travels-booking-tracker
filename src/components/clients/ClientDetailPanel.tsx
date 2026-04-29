'use client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ButtonLink } from '@/components/ui/button-link'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Phone, Mail, MapPin, Plus } from 'lucide-react'
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
      <SheetContent className="w-full sm:w-[420px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-[#D4DCFF] flex items-center justify-center text-xl font-semibold text-[#1A56DB]">
              {initials}
            </div>
            <div>
              <SheetTitle className="text-[#191B23]">{client.name}</SheetTitle>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge variant="secondary" className="text-xs capitalize">{client.client_type}</Badge>
                {client.is_verified && <Badge className="bg-green-100 text-green-700 text-xs">Verified</Badge>}
                {client.is_vip && <Badge className="bg-yellow-100 text-yellow-700 text-xs">VIP</Badge>}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <section>
            <h3 className="text-label-caps text-[#737686] mb-2">Contact Details</h3>
            <div className="space-y-2">
              {client.primary_phone && (
                <div className="flex items-center gap-2 text-sm text-[#191B23]">
                  <Phone className="w-4 h-4 text-[#737686]" />
                  {client.primary_phone}
                </div>
              )}
              {client.primary_email && (
                <div className="flex items-center gap-2 text-sm text-[#191B23]">
                  <Mail className="w-4 h-4 text-[#737686]" />
                  {client.primary_email}
                </div>
              )}
              {clientWithExtras.contacts?.map(c => (
                <div key={c.id} className="flex items-center gap-2 text-sm text-[#434654]">
                  {c.contact_type === 'phone' ? <Phone className="w-4 h-4 text-[#737686]" /> : <Mail className="w-4 h-4 text-[#737686]" />}
                  {c.value}
                  <span className="text-xs text-[#737686]">({c.role})</span>
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
                {client.designation && <p className="text-xs text-[#434654]">{client.designation}</p>}
              </section>
            </>
          )}

          <Separator />

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-label-caps text-[#737686]">Saved Locations</h3>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-[#1A56DB] gap-1">
                <Plus className="w-3 h-3" /> Add
              </Button>
            </div>
            {clientWithExtras.locations?.length === 0 ? (
              <p className="text-xs text-[#737686]">No saved locations</p>
            ) : (
              <div className="space-y-1.5">
                {clientWithExtras.locations?.map(loc => (
                  <div key={loc.id} className="flex items-start gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-[#737686] mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-[#191B23] capitalize">{loc.keyword}</span>
                      <p className="text-xs text-[#434654]">{loc.address}</p>
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
                    className="flex items-center justify-between p-2 rounded border border-[#C3C5D7] hover:bg-[#F3F3FE] transition-colors group"
                  >
                    <div>
                      <div className="text-xs font-medium text-[#191B23] group-hover:text-[#1A56DB]">
                        {b.booking_ref}
                      </div>
                      <div className="text-xs text-[#737686] mt-0.5">
                        {formatBookingDateTime(b.pickup_date, null)}
                        {b.pickup_location && ` · ${b.pickup_location.slice(0, 30)}${b.pickup_location.length > 30 ? '…' : ''}`}
                      </div>
                    </div>
                    <BookingStatusBadge status={b.status} />
                  </a>
                ))}
              </div>
            )}
          </section>

          <Separator />

          <div className="flex gap-2">
            <ButtonLink href={`/bookings/new?client_id=${client.id}`} size="sm" className="flex-1 bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm text-xs text-center">
              Book Cab
            </ButtonLink>
            <Button variant="outline" size="sm" className="rounded-sm text-xs">Edit</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
