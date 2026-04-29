'use client'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TopbarProps {
  title?: string
}

export function Topbar({ title }: TopbarProps) {
  return (
    <header className="h-14 border-b border-[#C3C5D7] bg-white flex items-center justify-between px-6 shrink-0">
      <div className="text-sm font-medium text-[#434654]">{title}</div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="text-[#434654] hover:text-[#191B23]">
          <Bell className="w-4 h-4" />
        </Button>
      </div>
    </header>
  )
}
