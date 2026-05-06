'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Client } from '@/types'

export function useClients(search?: string) {
  const params = new URLSearchParams()
  if (search) params.set('q', search)
  return useQuery<Client[]>({
    queryKey: ['clients', search],
    queryFn: () => fetch(`/api/clients?${params}`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() }),
  })
}

export function useClient(id: string) {
  return useQuery<Client>({
    queryKey: ['clients', id],
    queryFn: () => fetch(`/api/clients/${id}`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() }),
    enabled: !!id,
  })
}

export function useCreateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Client>) =>
      fetch('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })
}

export function useUpdateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Client> }) =>
      fetch(`/api/clients/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })
}
