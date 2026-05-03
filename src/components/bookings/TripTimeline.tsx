'use client'

import { CheckCircle2, Circle, XCircle, Clock } from 'lucide-react'
import { formatTimestamp } from '@/lib/utils/date'

interface TimelineBooking {
  status: string
  created_at: string
  approved_at?: string | null
  approved_by?: string | null
  approval_status?: string | null
  driver_id?: string | null
  driver?: { name: string } | null
  company?: { approval_required?: boolean } | null
  cancelled_at?: string | null
  cancelled_reason?: string | null
  source?: string | null
}

type StepState = 'done' | 'active' | 'upcoming' | 'skipped'

interface Step {
  key: string
  label: string
  sublabel?: string
  state: StepState
  timestamp?: string | null
}

const STATUS_ORDER = ['received', 'approval', 'confirmed', 'driver', 'in_progress', 'completed'] as const

function currentStepKey(booking: TimelineBooking): string {
  const s = booking.status
  if (s === 'pending_approval') return 'approval'
  if (s === 'confirmed') return booking.driver_id ? 'driver' : 'confirmed'
  if (s === 'in_progress') return 'in_progress'
  if (s === 'completed') return 'completed'
  return 'received' // draft
}

function stepState(key: string, booking: TimelineBooking): StepState {
  if (booking.status === 'cancelled') {
    // show what was done before cancellation
    const preCancel = currentStepKey({ ...booking, status: booking.approval_status === 'approved' ? 'confirmed' : booking.approval_status === 'pending' ? 'pending_approval' : 'draft' })
    const currentIdx = STATUS_ORDER.indexOf(preCancel as typeof STATUS_ORDER[number])
    const stepIdx = STATUS_ORDER.indexOf(key as typeof STATUS_ORDER[number])
    if (stepIdx < currentIdx) return 'done'
    if (stepIdx === currentIdx) return 'done'
    return 'upcoming'
  }

  const current = currentStepKey(booking)
  const currentIdx = STATUS_ORDER.indexOf(current as typeof STATUS_ORDER[number])
  const stepIdx = STATUS_ORDER.indexOf(key as typeof STATUS_ORDER[number])

  if (stepIdx < currentIdx) return 'done'
  if (stepIdx === currentIdx) return 'active'
  return 'upcoming'
}

export function TripTimeline({ booking }: { booking: TimelineBooking }) {
  const hasApproval = !!(booking.approval_status || booking.company?.approval_required)
  const isCancelled = booking.status === 'cancelled'

  const steps: Step[] = [
    {
      key: 'received',
      label: 'Booking Received',
      sublabel:
        booking.source === 'whatsapp' ? 'via WhatsApp' :
        booking.source === 'email' ? 'via Email' :
        booking.source === 'manual' ? 'Manual entry' : undefined,
      state: stepState('received', booking),
      timestamp: booking.created_at,
    },
    ...(hasApproval ? [{
      key: 'approval',
      label: booking.approval_status === 'approved' ? 'Approval Granted' : 'Awaiting Approval',
      sublabel: booking.approved_by ? `by ${booking.approved_by}` : undefined,
      state: stepState('approval', booking),
      timestamp: booking.approved_at,
    }] : []),
    {
      key: 'confirmed',
      label: 'Confirmed',
      state: stepState('confirmed', booking),
    },
    {
      key: 'driver',
      label: 'Driver Assigned',
      sublabel: booking.driver?.name ?? undefined,
      state: stepState('driver', booking),
    },
    {
      key: 'in_progress',
      label: 'In Progress',
      state: stepState('in_progress', booking),
    },
    {
      key: 'completed',
      label: 'Completed',
      state: stepState('completed', booking),
    },
  ]

  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1 && !isCancelled
        return (
          <div key={step.key} className="flex gap-3">
            {/* Icon + connector */}
            <div className="flex flex-col items-center">
              <StepIcon state={step.state} />
              {!isLast && (
                <div className={`w-px flex-1 min-h-[20px] mt-0.5 ${step.state === 'done' ? 'bg-[#10B981]' : 'bg-[#E5E7EB]'}`} />
              )}
            </div>

            {/* Content */}
            <div className={`pb-4 flex-1 min-w-0 ${isLast ? 'pb-0' : ''}`}>
              <div className={`text-sm font-medium leading-none ${
                step.state === 'active' ? 'text-[#1A56DB]' :
                step.state === 'done' ? 'text-[#191B23]' :
                'text-[#9CA3AF]'
              }`}>
                {step.label}
              </div>
              {step.sublabel && (
                <div className={`text-xs mt-0.5 ${step.state === 'upcoming' ? 'text-[#D1D5DB]' : 'text-[#737686]'}`}>
                  {step.sublabel}
                </div>
              )}
              {step.timestamp && step.state !== 'upcoming' && (
                <div className="text-xs text-[#9CA3AF] mt-0.5">{formatTimestamp(step.timestamp)}</div>
              )}
            </div>
          </div>
        )
      })}

      {/* Cancelled step appended */}
      {isCancelled && (
        <div className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-5 h-5 rounded-full flex items-center justify-center bg-red-100">
              <XCircle className="w-4 h-4 text-red-500" />
            </div>
          </div>
          <div className="pb-0 flex-1">
            <div className="text-sm font-medium text-red-600 leading-none">Cancelled</div>
            {booking.cancelled_reason && (
              <div className="text-xs text-[#737686] mt-0.5">{booking.cancelled_reason}</div>
            )}
            {booking.cancelled_at && (
              <div className="text-xs text-[#9CA3AF] mt-0.5">{formatTimestamp(booking.cancelled_at)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <div className="w-5 h-5 rounded-full flex items-center justify-center bg-[#10B981] shrink-0">
        <CheckCircle2 className="w-4 h-4 text-white" />
      </div>
    )
  }
  if (state === 'active') {
    return (
      <div className="w-5 h-5 rounded-full flex items-center justify-center bg-[#1A56DB] shrink-0 ring-2 ring-[#1A56DB]/20">
        <Circle className="w-3 h-3 text-white fill-white" />
      </div>
    )
  }
  return (
    <div className="w-5 h-5 rounded-full border-2 border-[#D1D5DB] bg-white shrink-0" />
  )
}
