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
            <div className="flex items-center gap-1.5 mt-0.5">
              <a href={`tel:${driver.phone}`} onClick={e => e.stopPropagation()} className="text-xs text-[#737686] truncate hover:underline hover:text-[#1A56DB]">{driver.phone}</a>
              <a href={`https://wa.me/${driver.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[#25D366] hover:text-[#128C7E] shrink-0" title="WhatsApp">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </a>
            </div>
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
