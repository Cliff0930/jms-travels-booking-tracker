'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Driver, DriverStatus } from '@/types'

export function useDrivers(filters?: { status?: DriverStatus; vehicle_type?: string }) {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.vehicle_type) params.set('vehicle_type', filters.vehicle_type)
  return useQuery<Driver[]>({
    queryKey: ['drivers', filters],
    queryFn: () => fetch(`/api/drivers?${params}`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() }),
  })
}

export function useDriver(id: string) {
  return useQuery<Driver>({
    queryKey: ['drivers', id],
    queryFn: () => fetch(`/api/drivers/${id}`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() }),
    enabled: !!id,
  })
}

export function useCreateDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Driver>) =>
      fetch('/api/drivers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  })
}

export function useUpdateDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Driver> }) =>
      fetch(`/api/drivers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  })
}
