'use client'
import { Car, Phone, Users } from 'lucide-react'
import type { Driver } from '@/types'

interface DriverCardProps {
  driver: Driver
  onSelect: (driver: Driver) => void
  onDeactivate?: (id: string) => void
}

function statusConfig(status: Driver['status'], isActive: boolean) {
  if (!isActive) return { gradient: 'from-gray-400 to-gray-500', pill: 'bg-red-50 text-red-600 border border-red-200', label: 'Inactive' }
  if (status === 'available')  return { gradient: 'from-emerald-400 to-teal-500',   pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200', label: 'Available' }
  if (status === 'on_duty')    return { gradient: 'from-[#1A56DB] to-[#6366F1]',    pill: 'bg-blue-50 text-[#1A56DB] border border-blue-200',          label: 'On Duty' }
  return                              { gradient: 'from-gray-400 to-slate-500',      pill: 'bg-gray-100 text-gray-600 border border-gray-200',           label: 'Off Duty' }
}

export function DriverCard({ driver, onSelect }: DriverCardProps) {
  const initials = driver.name.split(' ').map(n => n[0]).slice(0, 2).join('')
  const { gradient, pill, label } = statusConfig(driver.status, driver.is_active)

  return (
    <div
      className="bg-white rounded-2xl border border-[#E5E7EB] p-4 cursor-pointer hover:shadow-lg hover:border-[#7C3AED]/30 hover:-translate-y-0.5 transition-all group"
      onClick={() => onSelect(driver)}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-base font-bold text-white shrink-0 shadow-sm`}>
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#191B23] group-hover:text-[#7C3AED] transition-colors truncate">{driver.name}</div>
            <div className="text-xs text-[#737686] mt-0.5 truncate">{driver.phone}</div>
          </div>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${pill}`}>
          {label}
        </span>
      </div>

      <div className="border-t border-[#F3F4F6] pt-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 rounded-full bg-violet-50 flex items-center justify-center shrink-0">
              <Car className="w-3 h-3 text-[#7C3AED]" />
            </div>
            <span className="text-xs text-[#434654] truncate font-medium">{driver.vehicle_name}</span>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-[#7C3AED] border border-violet-100 shrink-0">{driver.vehicle_type}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#737686]">
          <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <Phone className="w-3 h-3 text-[#1A56DB]" />
          </div>
          <span className="truncate">{driver.vehicle_number}</span>
          <span className="shrink-0 flex items-center gap-1 text-[#9CA3AF]">
            <Users className="w-3 h-3" />{driver.seating_capacity}
          </span>
        </div>
      </div>
    </div>
  )
}
