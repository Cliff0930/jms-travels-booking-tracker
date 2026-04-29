import { AlertTriangle, Building2 } from 'lucide-react'

const FLAG_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon?: React.ReactNode }> = {
  missing_pickup:  { label: 'Missing Pickup', color: '#92400E', bg: '#FEF3C7', border: '#F59E0B', icon: <AlertTriangle className="w-3 h-3" /> },
  missing_date:    { label: 'Missing Date',   color: '#92400E', bg: '#FEF3C7', border: '#F59E0B', icon: <AlertTriangle className="w-3 h-3" /> },
  missing_time:    { label: 'Missing Time',   color: '#92400E', bg: '#FEF3C7', border: '#F59E0B', icon: <AlertTriangle className="w-3 h-3" /> },
  missing_drop:    { label: 'No Drop',        color: '#713F12', bg: '#FEF9C3', border: '#EAB308' },
  unknown_company: { label: 'Unknown Corp',   color: '#C2410C', bg: '#FFF7ED', border: '#F97316', icon: <Building2 className="w-3 h-3" /> },
  driver_conflict: { label: 'Driver Conflict',color: '#DC2626', bg: '#FEE2E2', border: '#EF4444', icon: <AlertTriangle className="w-3 h-3" /> },
}

export function FlagBadge({ flag }: { flag: string }) {
  const cfg = FLAG_CONFIG[flag]
  if (!cfg) return null
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.border }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

export function FlagList({ flags }: { flags: string[] }) {
  if (!flags?.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map(f => <FlagBadge key={f} flag={f} />)}
    </div>
  )
}
