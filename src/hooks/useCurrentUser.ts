import { useQuery } from '@tanstack/react-query'
import type { UserProfile } from '@/types'

export function useCurrentUser() {
  return useQuery<UserProfile>({
    queryKey: ['auth', 'me'],
    queryFn: () => fetch('/api/auth/me').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function useIsAdmin() {
  const { data } = useCurrentUser()
  return data?.role === 'admin'
}

export function useCanEdit() {
  const { data } = useCurrentUser()
  return data?.role === 'admin' || data?.role === 'operator'
}
