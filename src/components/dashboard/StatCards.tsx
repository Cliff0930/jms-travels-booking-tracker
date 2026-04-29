'use client'
import { BookOpen, Clock, CheckCircle, AlertTriangle } from 'lucide-react'

interface StatCardsProps {
  stats: {
    active: number
    pending: number
    completedToday: number
    flagged: number
  }
}

const CARDS = [
  { key: 'active' as const,        label: 'Active',          icon: BookOpen,      color: '#1A56DB', bg: '#DBEAFE' },
  { key: 'pending' as const,       label: 'Pending Approval', icon: Clock,        color: '#7E3AF2', bg: '#EDE9FE' },
  { key: 'completedToday' as const, label: 'Completed Today',  icon: CheckCircle,  color: '#059669', bg: '#D1FAE5' },
  { key: 'flagged' as const,       label: 'Flagged',          icon: AlertTriangle, color: '#D97706', bg: '#FEF3C7' },
]

export function StatCards({ stats }: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {CARDS.map(({ key, label, icon: Icon, color, bg }) => (
        <div key={key} className="bg-white rounded-lg border border-[#C3C5D7] p-4 card-hover">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-label-caps text-[#737686]">{label}</p>
              <p className="text-3xl font-bold text-[#191B23] mt-1">{stats[key]}</p>
            </div>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: bg }}>
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
