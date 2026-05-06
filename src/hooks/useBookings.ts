'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Booking, BookingStatus, MessageLog } from '@/types'

export function useBookings(filters?: { status?: BookingStatus; date?: string }) {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.date) params.set('date', filters.date)
  return useQuery<Booking[]>({
    queryKey: ['bookings', filters],
    queryFn: () => fetch(`/api/bookings?${params}`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() }),
  })
}

export function useBooking(id: string) {
  return useQuery<Booking>({
    queryKey: ['bookings', id],
    queryFn: () => fetch(`/api/bookings/${id}`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() }),
    enabled: !!id,
  })
}

export function useClientBookings(clientId: string | undefined) {
  return useQuery<Booking[]>({
    queryKey: ['bookings', 'client', clientId],
    queryFn: () => fetch(`/api/bookings?client_id=${clientId}`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() }),
    enabled: !!clientId,
  })
}

export function useBookingMessages(bookingId: string) {
  return useQuery<MessageLog[]>({
    queryKey: ['booking-messages', bookingId],
    queryFn: () => fetch(`/api/bookings/${bookingId}/messages`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() }),
    enabled: !!bookingId,
  })
}

export function useCreateBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: Partial<Booking>) => {
      const res = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create booking')
      return json as Booking
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  })
}

export function useUpdateBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Booking> }) =>
      fetch(`/api/bookings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['bookings', id] })
    },
  })
}

export function useConfirmBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/bookings/${id}/confirm`, { method: 'POST' }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  })
}

export function useCancelBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      fetch(`/api/bookings/${id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  })
}

export function useAssignDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ bookingId, driverId }: { bookingId: string; driverId: string }) =>
      fetch(`/api/bookings/${bookingId}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driver_id: driverId }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  })
}

export function useSendApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (bookingId: string) =>
      fetch(`/api/bookings/${bookingId}/send-approval`, { method: 'POST' }).then(r => r.json()),
    onSuccess: (_, bookingId) => {
      qc.invalidateQueries({ queryKey: ['bookings', bookingId] })
      qc.invalidateQueries({ queryKey: ['booking-messages', bookingId] })
    },
  })
}
