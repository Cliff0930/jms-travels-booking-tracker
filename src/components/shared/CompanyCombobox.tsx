'use client'
import { useState, useRef, useEffect } from 'react'
import { Building2, Check, ChevronsUpDown, X } from 'lucide-react'
import type { Company } from '@/types'

interface CompanyComboboxProps {
  value: string       // company_id or ''
  companies: Company[]
  onChange: (id: string) => void
  className?: string
  inputClassName?: string
}

export function CompanyCombobox({ value, companies, onChange, className = '', inputClassName = '' }: CompanyComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = companies.find(c => c.id === value) ?? null

  const filtered = search.trim()
    ? companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : companies

  function select(id: string) {
    onChange(id)
    setSearch('')
    setOpen(false)
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('')
    setSearch('')
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`flex items-center gap-1.5 h-9 px-2.5 rounded-md border border-[#C3C5D7] bg-white cursor-pointer hover:border-[#9CA3AF] transition-colors ${inputClassName}`}
        onClick={() => { setOpen(v => !v); setTimeout(() => inputRef.current?.focus(), 0) }}
      >
        <Building2 className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />

        {open ? (
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={selected ? selected.name : 'Search company…'}
            className="flex-1 text-sm bg-transparent outline-none min-w-0 text-[#191B23] placeholder:text-[#9CA3AF]"
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className={`flex-1 text-sm truncate ${selected ? 'text-[#191B23]' : 'text-[#9CA3AF]'}`}>
            {selected ? selected.name : 'No company'}
          </span>
        )}

        {selected ? (
          <button type="button" onClick={clear} className="shrink-0 text-[#9CA3AF] hover:text-[#191B23] transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <ChevronsUpDown className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-[#C3C5D7] bg-white shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-[#737686]">No companies found</div>
          ) : (
            filtered.map(co => (
              <button
                key={co.id}
                type="button"
                onClick={() => select(co.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-[#F3F3FE] transition-colors ${value === co.id ? 'text-[#1A56DB] font-medium' : 'text-[#191B23]'}`}
              >
                {value === co.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                <span className={value === co.id ? '' : 'pl-[19px]'}>{co.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
