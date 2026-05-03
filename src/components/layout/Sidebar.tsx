'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, BookOpen, Users, Building2, Car, BarChart3, Settings, LogOut, MessageSquare, ShieldCheck,
} from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/hooks/useCurrentUser'

const NAV_ITEMS = [
  { href: '/',          label: 'Dashboard', icon: LayoutDashboard },
  { href: '/bookings',  label: 'Bookings',  icon: BookOpen },
  { href: '/messages',  label: 'Messages',  icon: MessageSquare },
  { href: '/clients',   label: 'Clients',   icon: Users },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/drivers',   label: 'Drivers',   icon: Car },
  { href: '/reports',   label: 'Reports',   icon: BarChart3 },
  { href: '/settings',  label: 'Settings',  icon: Settings },
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  operator: 'Operator',
  viewer: 'Viewer',
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: me } = useCurrentUser()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = me?.name
    ? me.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : me?.email?.[0]?.toUpperCase() ?? '?'

  return (
    <aside className="hidden md:flex flex-col w-[240px] min-h-screen bg-[#EDEDF8] border-r border-[#C3C5D7] shrink-0">
      <div className="flex items-center px-4 h-14 border-b border-[#C3C5D7]">
        <Image src="/icons/icon-512.png" alt="JMS Travels" width={120} height={120} className="h-9 w-auto object-contain rounded" priority />
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#D4DCFF] text-[#1A56DB]'
                  : 'text-[#434654] hover:bg-[#D4DCFF]/60 hover:text-[#191B23]'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}

        {/* Admin-only: Users management */}
        {me?.role === 'admin' && (
          <Link
            href="/users"
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              pathname.startsWith('/users')
                ? 'bg-[#D4DCFF] text-[#1A56DB]'
                : 'text-[#434654] hover:bg-[#D4DCFF]/60 hover:text-[#191B23]'
            )}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            Users
          </Link>
        )}
      </nav>

      <div className="px-2 pb-4 space-y-1 border-t border-[#C3C5D7] pt-3">
        {me && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-md mb-1">
            <div className="w-7 h-7 rounded-full bg-[#1A56DB] flex items-center justify-center text-xs font-semibold text-white shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#191B23] truncate">{me.name || me.email}</div>
              <div className="text-[11px] text-[#737686]">{ROLE_LABELS[me.role] ?? me.role}</div>
            </div>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-[#434654] hover:bg-red-50 hover:text-red-600 transition-colors w-full"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
