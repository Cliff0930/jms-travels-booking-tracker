import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkAndCacheWhatsApp } from '@/lib/whatsapp/check-contact'
import { normalizePhone } from '@/lib/utils/phone'

const DELAY_MS = 500 // 500ms between checks to avoid rate-limiting

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// POST /api/admin/backfill-wa-status
// Checks all phone numbers in clients, drivers, and client_contacts against Meta.
// Safe to run multiple times — already-cached numbers are skipped (no API call).
export async function POST() {
  const supabase = createAdminClient()

  // Collect all unique phone numbers across the three tables
  const phones = new Set<string>()

  const [{ data: clients }, { data: drivers }, { data: contacts }] = await Promise.all([
    supabase.from('clients').select('primary_phone').not('primary_phone', 'is', null),
    supabase.from('drivers').select('phone').eq('is_active', true),
    supabase.from('client_contacts').select('value').eq('contact_type', 'phone'),
  ])

  for (const c of clients ?? []) {
    const n = normalizePhone(c.primary_phone)
    if (n) phones.add(n)
  }
  for (const d of drivers ?? []) {
    const n = normalizePhone(d.phone)
    if (n) phones.add(n)
  }
  for (const ct of contacts ?? []) {
    const n = normalizePhone(ct.value)
    if (n) phones.add(n)
  }

  const total = phones.size
  const results: { phone: string; status: string }[] = []

  for (const phone of phones) {
    const status = await checkAndCacheWhatsApp(phone)
    results.push({ phone, status })
    await sleep(DELAY_MS)
  }

  const valid   = results.filter(r => r.status === 'valid').length
  const invalid = results.filter(r => r.status === 'invalid').length
  const unknown = results.filter(r => r.status === 'unknown').length

  return NextResponse.json({ total, valid, invalid, unknown, results })
}
