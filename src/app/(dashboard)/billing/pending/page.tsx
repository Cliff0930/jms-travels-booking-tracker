'use client'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface PendingBooking {
  id: string; booking_ref: string; pickup_date: string; guest_name: string | null
  booking_type: string | null; company_name: string | null; driver_name: string | null; vehicle: string | null
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function BookingTable({ items, emptyMsg }: { items: PendingBooking[]; emptyMsg: string }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-green-700 bg-green-50 rounded-lg border border-green-200">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        {emptyMsg}
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            {['Date', 'Booking Ref', 'Guest', 'Type', 'Company', 'Driver / Cab', ''].map(h => (
              <th key={h} className="px-4 py-3 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {items.map(b => (
            <tr key={b.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 whitespace-nowrap">{fmtDate(b.pickup_date)}</td>
              <td className="px-4 py-3 font-medium whitespace-nowrap">{b.booking_ref}</td>
              <td className="px-4 py-3 max-w-[120px] truncate">{b.guest_name ?? '—'}</td>
              <td className="px-4 py-3">
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                  b.booking_type === 'company' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600')}>
                  {b.booking_type === 'company' ? 'Corporate' : 'Personal'}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500 max-w-[120px] truncate">{b.company_name ?? '—'}</td>
              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{b.driver_name ?? '—'}{b.vehicle ? ` · ${b.vehicle}` : ''}</td>
              <td className="px-4 py-3">
                <Link href={`/bookings/${b.id}`} className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-xs">
                  View <ExternalLink className="w-3 h-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PendingBillingPage() {
  const { data, isLoading } = useQuery<{ unbilled: PendingBooking[]; unsettled: PendingBooking[] }>({
    queryKey: ['billing-pending'],
    queryFn: () => fetch('/api/billing/pending').then(r => r.json()),
  })

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  const unbilled = data?.unbilled ?? []
  const unsettled = data?.unsettled ?? []

  return (
    <div className="space-y-8">
      <PageHeader title="Pending Billing & Settlement" description="Completed trips not yet billed or included in a driver settlement" />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          {unbilled.length > 0
            ? <AlertTriangle className="w-5 h-5 text-amber-500" />
            : <CheckCircle2 className="w-5 h-5 text-green-600" />}
          <h2 className="text-base font-semibold text-gray-900">
            Unbilled trips
            {unbilled.length > 0 && <span className="ml-2 text-sm font-normal text-amber-600">({unbilled.length} pending)</span>}
          </h2>
        </div>
        <p className="text-xs text-gray-500">
          Corporate trips not in any invoice · Personal trips not in any cash bill. Does not include excluded trips.
        </p>
        <BookingTable items={unbilled} emptyMsg="All completed trips have been billed." />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          {unsettled.length > 0
            ? <AlertTriangle className="w-5 h-5 text-amber-500" />
            : <CheckCircle2 className="w-5 h-5 text-green-600" />}
          <h2 className="text-base font-semibold text-gray-900">
            Not in driver settlement
            {unsettled.length > 0 && <span className="ml-2 text-sm font-normal text-amber-600">({unsettled.length} pending)</span>}
          </h2>
        </div>
        <p className="text-xs text-gray-500">
          Completed trips not yet included in any driver settlement statement.
        </p>
        <BookingTable items={unsettled} emptyMsg="All completed trips are included in driver settlements." />
      </section>
    </div>
  )
}
