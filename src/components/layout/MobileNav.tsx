'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen, Users, LayoutDashboard, MoreHorizontal, BarChart3, Settings,
  Building2, Car, X, MessageSquare, ShieldCheck, Bell, Wallet, IndianRupee,
  Receipt, FileText, TrendingUp, Banknote, AlertCircle, AlertTriangle,
  FileMinus, PieChart, XCircle, CalendarDays, Clock, FileCheck2, ShoppingCart,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'

const PRIMARY_NAV = [
  { href: '/',                  label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/bookings',          label: 'Bookings',  icon: BookOpen },
  { href: '/bookings/calendar', label: 'Calendar',  icon: CalendarDays },
]

interface NavItem { href: string; label: string; icon: React.ElementType }
interface NavGroup { label: string; items: NavItem[] }

const MORE_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { href: '/messages',       label: 'Messages',  icon: MessageSquare },
      { href: '/reimbursements', label: 'Reimburse', icon: Wallet },
      { href: '/advances',       label: 'Advances',  icon: IndianRupee },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/drivers',   label: 'Drivers',   icon: Car },
      { href: '/companies', label: 'Companies', icon: Building2 },
      { href: '/clients',   label: 'Clients',   icon: Users },
    ],
  },
  {
    label: 'Billing',
    items: [
      { href: '/billing/invoices',           label: 'Invoices',        icon: Receipt },
      { href: '/billing/cash-bills',         label: 'Cash Bills',      icon: Banknote },
      { href: '/billing/pending',            label: 'Pending',         icon: AlertCircle },
      { href: '/billing/rate-cards',         label: 'Rate Cards',      icon: IndianRupee },
      { href: '/billing/payments',           label: 'Payments',        icon: Wallet },
      { href: '/billing/credit-notes',       label: 'Credit Notes',    icon: FileMinus },
      { href: '/billing/gst',                label: 'GST',             icon: BarChart3 },
      { href: '/billing/driver-settlements', label: 'Settlements',     icon: FileText },
      { href: '/billing/summary',            label: 'P&L',             icon: TrendingUp },
      { href: '/billing/margin',             label: 'Margin',          icon: PieChart },
      { href: '/billing/ar-ageing',          label: 'AR Ageing',       icon: Clock },
      { href: '/billing/gstr1',              label: 'GSTR-1',          icon: FileCheck2 },
      { href: '/billing/expenses',           label: 'Expenses',        icon: ShoppingCart },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { href: '/analytics',             label: 'Dashboard',   icon: PieChart },
      { href: '/analytics/companies',   label: 'Scorecards',  icon: Building2 },
      { href: '/analytics/drivers',     label: 'Drivers',     icon: Car },
      { href: '/analytics/outstanding', label: 'Outstanding', icon: AlertTriangle },
      { href: '/analytics/cashflow',    label: 'Cash Flow',   icon: TrendingUp },
      { href: '/analytics/tds',         label: 'TDS',         icon: Receipt },
      { href: '/analytics/cancellations', label: 'Cancels',   icon: XCircle },
      { href: '/reports',               label: 'Trip Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/notifications', label: 'Alerts',   icon: Bell },
      { href: '/settings',      label: 'Settings', icon: Settings },
    ],
  },
]

const MORE_GROUPS_ADMIN: NavGroup[] = MORE_GROUPS.map(g =>
  g.label === 'System'
    ? { ...g, items: [...g.items, { href: '/users', label: 'Users', icon: ShieldCheck }] }
    : g
)

export function MobileNav() {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)
  const { data: me } = useCurrentUser()

  const groups = me?.role === 'admin' ? MORE_GROUPS_ADMIN : MORE_GROUPS
  const moreActive = groups.flatMap(g => g.items).some(
    ({ href }) => pathname === href || pathname.startsWith(href + '/')
  )

  return (
    <>
      {showMore && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/20 z-40" onClick={() => setShowMore(false)} />
          <div className="md:hidden fixed bottom-16 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg max-h-[70vh] overflow-y-auto">
            <div className="p-3 space-y-3">
              {groups.map(group => (
                <div key={group.label}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-1 mb-1.5">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {group.items.map(({ href, label, icon: Icon }) => {
                      const isActive = pathname === href || pathname.startsWith(href + '/')
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setShowMore(false)}
                          className={cn(
                            'flex flex-col items-center gap-1 py-2.5 rounded-lg text-[11px] font-semibold transition-colors',
                            isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'
                          )}
                        >
                          <Icon className={cn('w-5 h-5', isActive ? 'text-blue-700' : 'text-gray-400')} />
                          <span className="leading-tight text-center">{label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="grid grid-cols-4">
          {PRIMARY_NAV.map(({ href, label, icon: Icon, exact }) => {
            const isActive = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setShowMore(false)}
                className={cn(
                  'flex flex-col items-center gap-1 py-3 text-xs font-semibold transition-colors',
                  isActive ? 'text-blue-700' : 'text-gray-400'
                )}
              >
                <Icon className={cn('w-5 h-5', isActive ? 'text-blue-700' : 'text-gray-400')} />
                {label}
              </Link>
            )
          })}

          <button
            type="button"
            onClick={() => setShowMore(v => !v)}
            className={cn(
              'flex flex-col items-center gap-1 py-3 text-xs font-semibold transition-colors',
              (showMore || moreActive) ? 'text-blue-700' : 'text-gray-400'
            )}
          >
            {showMore
              ? <X className="w-5 h-5" />
              : <MoreHorizontal className={cn('w-5 h-5', (showMore || moreActive) ? 'text-blue-700' : 'text-gray-400')} />
            }
            More
          </button>
        </div>
      </nav>
    </>
  )
}
