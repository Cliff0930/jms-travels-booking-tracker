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

  const allNavItems = [
    ...NAV_ITEMS,
    ...(me?.role === 'admin' ? [{ href: '/users', label: 'Users', icon: ShieldCheck }] : []),
  ]

  return (
    <aside className="hidden md:flex flex-col w-64 min-h-screen fixed left-0 top-0 h-full z-40 bg-white border-r border-gray-200 shrink-0">
      {/* Logo — same height as header */}
      <div className="h-16 flex items-center px-5 border-b border-gray-200 gap-3">
        <Image src="/icons/icon-512.png" alt="JMS Travels" width={120} height={120} className="h-8 w-auto object-contain rounded" priority />
        <div>
          <p className="text-sm font-black text-blue-700 leading-none">JMS Travels</p>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mt-0.5">Fleet Ops</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {allNavItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all',
                isActive
                  ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-blue-700' : 'text-gray-400')} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 border-t border-gray-100 pt-3 space-y-1">
        {me && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg mb-1">
            <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-gray-900 truncate">{me.name || me.email}</div>
              <div className="text-[11px] text-gray-400">{ROLE_LABELS[me.role] ?? me.role}</div>
            </div>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors w-full"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
