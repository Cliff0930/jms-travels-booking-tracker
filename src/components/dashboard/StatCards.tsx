'use client'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StatCardDef {
  key: string
  label: string
  value: number
  icon: LucideIcon
  color: string
  bg: string
  onClick?: () => void
  active?: boolean
}

interface StatCardsProps {
  cards: StatCardDef[]
}

export function StatCards({ cards }: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {cards.map(({ key, label, value, icon: Icon, color, bg, onClick, active }) => (
        <button
          key={key}
          type="button"
          onClick={onClick}
          className={cn(
            'bg-white rounded-xl border p-4 text-left transition-all',
            onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : 'cursor-default',
            active
              ? 'border-[#1A56DB] ring-2 ring-[#1A56DB]/20 shadow-sm'
              : 'border-[#E5E7EB]'
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-label-caps text-[#737686] truncate">{label}</p>
              <p className="text-2xl font-bold text-[#191B23] mt-1">{value}</p>
            </div>
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: bg }}
            >
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
