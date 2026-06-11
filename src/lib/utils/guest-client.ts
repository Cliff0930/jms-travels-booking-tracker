import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from './phone'

interface GuestClientParams {
  guestName: string
  guestPhone: string | null | undefined
  companyId: string | null | undefined
  salutation?: 'sir' | 'madam' | null
}

/**
 * Find an existing guest client or create a new one.
 *
 * Matching priority:
 * 1. Normalized phone + all common format variants (bare 10-digit, 91-prefixed, raw)
 * 2. Name (case-insensitive) + same company (fallback when no phone or no phone match)
 * 3. Create new record if no match found
 *
 * Returns { id, name } where name is always the canonical name stored in the directory —
 * callers should use this name on the booking rather than the user-typed name.
 */
export async function findOrCreateGuestClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  { guestName, guestPhone, companyId, salutation }: GuestClientParams,
): Promise<{ id: string; name: string } | null> {
  // Layer 1: Phone matching with all format variants
  if (guestPhone?.trim()) {
    const normalized = normalizePhone(guestPhone)
    const candidates = [...new Set([
      normalized,
      guestPhone.trim(),
      // bare 10-digit (strip 91 prefix if present)
      normalized.startsWith('91') && normalized.length === 12 ? normalized.slice(2) : null,
      // 0-prefixed
      normalized.startsWith('91') && normalized.length === 12 ? '0' + normalized.slice(2) : null,
      // +91 format
      normalized.startsWith('91') && normalized.length === 12 ? '+' + normalized : null,
    ].filter(Boolean) as string[])]

    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .in('primary_phone', candidates)
      .limit(1)
      .maybeSingle()

    if (data?.id) return { id: data.id, name: data.name }
  }

  // Layer 2: Name + company fallback (no phone or phone didn't match)
  if (companyId) {
    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .eq('client_type', 'guest')
      .ilike('name', guestName.trim())
      .eq('guest_of_company_id', companyId)
      .limit(1)
      .maybeSingle()

    if (data?.id) return { id: data.id, name: data.name }
  }

  // Layer 3: Create new guest record
  const normalizedPhone = guestPhone?.trim() ? normalizePhone(guestPhone) : null
  const { data: newGuest } = await supabase
    .from('clients')
    .insert({
      name: guestName.trim(),
      primary_phone: normalizedPhone || null,
      company_id: companyId ?? null,
      guest_of_company_id: companyId ?? null,
      client_type: 'guest',
      is_verified: false,
      is_vip: false,
      salutation: salutation ?? null,
    })
    .select('id, name')
    .single()

  return newGuest ? { id: newGuest.id, name: newGuest.name } : null
}
