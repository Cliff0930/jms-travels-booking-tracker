'use client'
import { Bell, HelpCircle, Settings } from 'lucide-react'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export function Header() {
  const { data: me } = useCurrentUser()

  const initials = me?.name
    ? me.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : me?.email?.[0]?.toUpperCase() ?? '?'

  return (
    <header className="fixed top-0 right-0 left-0 md:left-64 z-30 flex items-center justify-between px-4 md:px-6 h-16 bg-white border-b border-gray-200">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-500 md:hidden">JMS Travels</span>
      </div>

      <div className="flex items-center gap-1">
        <div className="flex items-center gap-1 pr-4 border-r border-gray-200">
          <button className="p-2 text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">
            <Bell className="w-5 h-5" />
          </button>
          <button className="p-2 text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">
            <HelpCircle className="w-5 h-5" />
          </button>
          <button className="p-2 text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-2 pl-4">
          <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-white text-xs font-bold">
            {initials}
          </div>
          <span className="hidden md:block text-sm font-medium text-gray-700">
            {me?.name || me?.email}
          </span>
        </div>
      </div>
    </header>
  )
}
