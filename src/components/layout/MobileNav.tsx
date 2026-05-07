'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Users, LayoutDashboard, MoreHorizontal, BarChart3, Settings, Building2, Car, X, MessageSquare, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'

const PRIMARY_NAV = [
  { href: '/',         label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/bookings', label: 'Bookings',  icon: BookOpen },
  { href: '/clients',  label: 'Clients',   icon: Users },
]

const MORE_NAV = [
  { href: '/drivers',   label: 'Drivers',   icon: Car },
  { href: '/messages',  label: 'Messages',  icon: MessageSquare },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/reports',   label: 'Reports',   icon: BarChart3 },
  { href: '/settings',  label: 'Settings',  icon: Settings },
]

const ADMIN_MORE_NAV = [
  ...MORE_NAV,
  { href: '/users', label: 'Users', icon: ShieldCheck },
]

export function MobileNav() {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)
  const { data: me } = useCurrentUser()

  const moreNav = me?.role === 'admin' ? ADMIN_MORE_NAV : MORE_NAV
  const moreActive = moreNav.some(({ href }) => pathname === href || pathname.startsWith(href + '/'))

  return (
    <>
      {showMore && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/20 z-40" onClick={() => setShowMore(false)} />
          <div className="md:hidden fixed bottom-16 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg p-3">
            <div className="grid grid-cols-3 gap-2">
              {moreNav.map(({ href, label, icon: Icon }) => {
                const isActive = pathname.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setShowMore(false)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-3 rounded-lg text-xs font-semibold transition-colors',
                      isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'
                    )}
                  >
                    <Icon className={cn('w-5 h-5', isActive ? 'text-blue-700' : 'text-gray-400')} />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
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
