'use client'
import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

interface ClientResult {
  id: string
  name: string
  primary_phone: string | null
  primary_email: string | null
  client_type: string
}

interface Props {
  companyId?: string | null
  value: string
  onChange: (name: string) => void
  onSelect: (name: string, phone: string | null) => void
  placeholder?: string
  className?: string
}

function typeBadge(clientType: string) {
  if (clientType === 'guest') return { label: 'Guest', cls: 'bg-teal-50 text-teal-700 border border-teal-200' }
  if (clientType === 'corporate') return { label: 'Employee', cls: 'bg-blue-50 text-blue-700 border border-blue-200' }
  return { label: clientType, cls: 'bg-gray-100 text-gray-600 border border-gray-200' }
}

export function GuestSearchCombobox({ companyId, value, onChange, onSelect, placeholder, className }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const enabled = value.trim().length >= 1

  const { data: results = [] } = useQuery<ClientResult[]>({
    queryKey: ['guest-search', companyId, value],
    queryFn: () => {
      const params = new URLSearchParams({ q: value.trim() })
      if (companyId) params.set('company_any', companyId)
      return fetch(`/api/clients?${params}`).then(r => r.json())
    },
    enabled,
    staleTime: 10_000,
  })

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelect(c: ClientResult) {
    onSelect(c.name, c.primary_phone ?? null)
    setOpen(false)
  }

  const showDropdown = open && enabled && results.length > 0

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <input
        type="text"
        value={value}
        placeholder={placeholder ?? 'Traveller name'}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        className="w-full h-9 px-3 rounded-md border border-[#C3C5D7] bg-white text-sm text-[#191B23] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#1A56DB] focus:border-transparent"
      />

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#E5E7EB] rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.slice(0, 15).map(c => {
            const badge = typeBadge(c.client_type)
            return (
              <button
                key={c.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleSelect(c)}
                className="w-full text-left px-3 py-2.5 hover:bg-[#EEF2FF] transition-colors border-b border-[#F3F4F6] last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#191B23] flex-1 truncate">{c.name}</span>
                  <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0', badge.cls)}>{badge.label}</span>
                </div>
                {(c.primary_phone || c.primary_email) && (
                  <div className="text-xs text-[#737686] mt-0.5">
                    {c.primary_phone ?? c.primary_email}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
