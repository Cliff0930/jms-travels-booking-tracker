import { cn } from '@/lib/utils'
import type { BookingStatus, DriverStatus } from '@/types'

const BOOKING_STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; bg: string }> = {
  draft:            { label: 'Draft',           color: '#6B7280', bg: '#F3F4F6' },
  pending_approval: { label: 'Pending Approval', color: '#7E3AF2', bg: '#EDE9FE' },
  confirmed:        { label: 'Confirmed',        color: '#1A56DB', bg: '#DBEAFE' },
  in_progress:      { label: 'In Progress',      color: '#D97706', bg: '#FEF3C7' },
  completed:        { label: 'Completed',        color: '#059669', bg: '#D1FAE5' },
  cancelled:        { label: 'Cancelled',        color: '#DC2626', bg: '#FEE2E2' },
}

const DRIVER_STATUS_CONFIG: Record<DriverStatus, { label: string; color: string; bg: string; dot: string }> = {
  available: { label: 'Available', color: '#059669', bg: '#D1FAE5', dot: '#10B981' },
  on_duty:   { label: 'On Duty',   color: '#D97706', bg: '#FEF3C7', dot: '#F59E0B' },
  off_duty:  { label: 'Off Duty',  color: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF' },
}

export function BookingStatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const cfg = BOOKING_STATUS_CONFIG[status]
  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-status-badge', className)}
      style={{ color: cfg.color, backgroundColor: cfg.bg }}
    >
      {cfg.label}
    </span>
  )
}

export function DriverStatusBadge({ status, className }: { status: DriverStatus; className?: string }) {
  const cfg = DRIVER_STATUS_CONFIG[status]
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-status-badge', className)}
      style={{ color: cfg.color, backgroundColor: cfg.bg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
      {cfg.label}
    </span>
  )
}

export function statusBarClass(status: BookingStatus): string {
  const map: Record<BookingStatus, string> = {
    draft:            'status-bar-draft',
    pending_approval: 'status-bar-pending',
    confirmed:        'status-bar-confirmed',
    in_progress:      'status-bar-inprogress',
    completed:        'status-bar-completed',
    cancelled:        'status-bar-cancelled',
  }
  return map[status]
}
