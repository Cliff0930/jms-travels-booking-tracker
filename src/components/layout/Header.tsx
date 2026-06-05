'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings } from 'lucide-react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PushSubscribeButton } from './PushSubscribeButton'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/bookings': 'Bookings',
  '/clients': 'Clients',
  '/companies': 'Companies',
  '/drivers': 'Drivers',
  '/messages': 'Messages',
  '/reimbursements': 'Reimbursements',
  '/advances': 'Advances',
  '/notifications': 'Notifications',
  '/reports': 'Trip Reports',
  '/settings': 'Settings',
  '/users': 'Users',
  '/analytics': 'Analytics',
  '/billing/invoices': 'Invoices',
  '/billing/cash-bills': 'Cash Bills',
  '/billing/pending': 'Pending Billing',
  '/billing/rate-cards': 'Rate Cards',
  '/billing/payments': 'Payments',
  '/billing/credit-notes': 'Credit Notes',
  '/billing/gst': 'GST Working',
  '/billing/driver-settlements': 'Driver Settlements',
  '/billing/summary': 'P&L Summary',
  '/billing/margin': 'Margin Tracker',
}

export function Header() {
  const pathname = usePathname()
  const { data: me } = useCurrentUser()

  const initials = me?.name
    ? me.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : me?.email?.[0]?.toUpperCase() ?? '?'

  const pageTitle = Object.entries(PAGE_TITLES).find(([key]) =>
    key === '/' ? pathname === '/' : pathname === key || pathname.startsWith(key + '/')
  )?.[1] ?? 'CabFlow'

  return (
    <header
      className="fixed top-0 right-0 left-0 md:left-64 z-30 bg-white border-b border-gray-200"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center justify-between px-4 md:px-6 h-16">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[#191B23] md:hidden">{pageTitle}</span>
          <span className="hidden md:block text-sm font-bold text-[#003fb1]">JMS Travels Fleet Ops</span>
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 pr-3 border-r border-gray-200">
            <PushSubscribeButton />
            <Link href="/settings" className="p-2 text-gray-500 hover:bg-gray-50 rounded-lg transition-colors" title="Settings">
              <Settings className="w-5 h-5" />
            </Link>
          </div>
          <div className="flex items-center gap-2 pl-3">
            <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-white text-xs font-bold">
              {initials}
            </div>
            <span className="hidden md:block text-sm font-medium text-gray-700">
              {me?.name || me?.email}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
