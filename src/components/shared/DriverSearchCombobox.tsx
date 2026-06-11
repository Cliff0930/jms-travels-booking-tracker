'use client'
import { useState, useRef, useEffect } from 'react'
import { Car, ChevronsUpDown } from 'lucide-react'
import type { Driver } from '@/types'

interface DriverSearchComboboxProps {
  value: string        // driver_id or ''
  drivers: Driver[]
  onSelect: (id: string) => void
  disabled?: boolean
  placeholder?: string
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '').toLowerCase()

export function DriverSearchCombobox({ value, drivers, onSelect, disabled, placeholder = 'Assign driver…' }: DriverSearchComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = drivers.find(d => d.id === value) ?? null

  const filtered = query.trim()
    ? drivers.filter(d => {
        const q = norm(query)
        return norm(d.name).includes(q) || norm(d.vehicle_number).includes(q) || norm(d.phone).includes(q)
      })
    : drivers

  function select(id: string) {
    onSelect(id)
    setQuery('')
    setOpen(false)
  }

  function toggle() {
    if (disabled) return
    setOpen(v => !v)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="relative flex-1">
      <div
        onClick={toggle}
        className={`flex items-center gap-1.5 h-7 px-2 rounded-sm border border-[#C3C5D7] bg-white transition-colors text-xs ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-[#9CA3AF]'}`}
      >
        <Car className="w-3 h-3 text-[#9CA3AF] shrink-0" />
        {open ? (
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={selected ? `${selected.name}` : 'Name, plate or phone…'}
            className="flex-1 bg-transparent outline-none min-w-0 text-[#191B23] placeholder:text-[#9CA3AF]"
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className={`flex-1 truncate ${selected ? 'text-[#191B23]' : 'text-[#9CA3AF]'}`}>
            {selected ? `${selected.name} · ${selected.vehicle_number}` : placeholder}
          </span>
        )}
        <ChevronsUpDown className="w-3 h-3 text-[#9CA3AF] shrink-0" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] rounded-md border border-[#C3C5D7] bg-white shadow-lg max-h-52 overflow-y-auto left-0">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[#737686]">No drivers found</div>
          ) : (
            filtered.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => select(d.id)}
                className={`w-full flex flex-col gap-0.5 px-3 py-2 text-left hover:bg-[#F3F3FE] transition-colors border-b border-[#F3F3FE] last:border-0 ${value === d.id ? 'bg-[#EEF2FF]' : ''}`}
              >
                <span className={`text-xs font-medium ${value === d.id ? 'text-[#1A56DB]' : 'text-[#191B23]'}`}>
                  {d.name}
                </span>
                <span className="text-[10px] text-[#737686]">
                  {d.vehicle_name} · <span className="font-mono">{d.vehicle_number}</span> · {d.phone}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
