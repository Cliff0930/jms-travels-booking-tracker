'use client'
import { MoreVertical } from 'lucide-react'
import { DriverStatusBadge } from '@/components/shared/StatusBadge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Driver } from '@/types'

interface DriverCardProps {
  driver: Driver
  onSelect: (driver: Driver) => void
  onDeactivate?: (id: string) => void
}

export function DriverCard({ driver, onSelect, onDeactivate }: DriverCardProps) {
  const initials = driver.name.split(' ').map(n => n[0]).slice(0, 2).join('')

  return (
    <div
      className="bg-white rounded-lg border border-[#C3C5D7] p-4 card-hover cursor-pointer"
      onClick={() => onSelect(driver)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#D4DCFF] flex items-center justify-center text-sm font-semibold text-[#1A56DB] shrink-0">
            {initials}
          </div>
          <div>
            <div className="font-medium text-[#191B23] text-sm">{driver.name}</div>
            <DriverStatusBadge status={driver.status} className="mt-0.5" />
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-[#EDEDF8] transition-colors text-[#434654] -mr-1"
            aria-label="Driver actions"
          >
            <MoreVertical className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={e => { e.stopPropagation(); onSelect(driver) }}>View Details</DropdownMenuItem>
            {driver.is_active && onDeactivate && (
              <DropdownMenuItem
                className="text-red-600"
                onClick={e => { e.stopPropagation(); onDeactivate(driver.id) }}
              >
                Deactivate
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#434654]">{driver.vehicle_name}</span>
          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-[#EDEDF8] text-[#434654]">{driver.vehicle_type}</span>
        </div>
        <div className="text-xs text-[#737686]">{driver.vehicle_number}</div>
        <div className="text-xs text-[#737686]">{driver.seating_capacity} passengers</div>
        <div className="text-xs text-[#737686]">{driver.phone}</div>
      </div>
    </div>
  )
}
