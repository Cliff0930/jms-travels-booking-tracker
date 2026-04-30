'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Users, Car, MoreHorizontal, BarChart3, Settings, Building2, X, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRIMARY_NAV = [
  { href: '/bookings', label: 'Bookings', icon: BookOpen },
  { href: '/clients',  label: 'Clients',  icon: Users },
  { href: '/drivers',  label: 'Drivers',  icon: Car },
]

const MORE_NAV = [
  { href: '/messages',  label: 'Messages',  icon: MessageSquare },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/reports',   label: 'Reports',   icon: BarChart3 },
  { href: '/settings',  label: 'Settings',  icon: Settings },
]

export function MobileNav() {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)
  const moreActive = MORE_NAV.some(({ href }) => pathname.startsWith(href))

  return (
    <>
      {/* More drawer */}
      {showMore && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/20 z-40"
            onClick={() => setShowMore(false)}
          />
          <div className="md:hidden fixed bottom-[57px] left-0 right-0 z-50 bg-white border-t border-[#C3C5D7] shadow-lg p-3">
            <div className="grid grid-cols-3 gap-2">
              {MORE_NAV.map(({ href, label, icon: Icon }) => {
                const isActive = pathname.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setShowMore(false)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-3 rounded-lg text-xs font-medium transition-colors',
                      isActive ? 'bg-[#D4DCFF] text-[#1A56DB]' : 'text-[#434654] hover:bg-[#F3F3FE]'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#C3C5D7] z-50">
        <div className="grid grid-cols-4">
          {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setShowMore(false)}
                className={cn(
                  'flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors relative',
                  isActive ? 'text-[#1A56DB]' : 'text-[#737686]'
                )}
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-[#1A56DB]" />
                )}
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            )
          })}

          <button
            type="button"
            onClick={() => setShowMore(v => !v)}
            className={cn(
              'flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors relative',
              (showMore || moreActive) ? 'text-[#1A56DB]' : 'text-[#737686]'
            )}
          >
            {(showMore || moreActive) && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-[#1A56DB]" />
            )}
            {showMore ? <X className="w-5 h-5" /> : <MoreHorizontal className="w-5 h-5" />}
            More
          </button>
        </div>
      </nav>
    </>
  )
}
