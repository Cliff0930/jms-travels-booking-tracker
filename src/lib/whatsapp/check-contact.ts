import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/utils/phone'

export type WhatsAppStatus = 'valid' | 'invalid' | 'unknown'

const CACHE_DAYS = 30

// Read cached status. Returns null if no entry or entry is older than CACHE_DAYS.
// Populated retroactively: when a send fails with a non-WhatsApp error code,
// the webhook handler writes 'invalid' here via cacheWhatsAppStatus().
export async function getCachedWhatsAppStatus(phone: string): Promise<WhatsAppStatus | null> {
  const normalized = normalizePhone(phone)
  if (!normalized) return null

  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('whatsapp_number_status')
      .select('status, checked_at')
      .eq('phone', normalized)
      .single()

    if (!data) return null

    const ageMs = Date.now() - new Date(data.checked_at).getTime()
    if (ageMs > CACHE_DAYS * 24 * 60 * 60 * 1000) return null

    return data.status as WhatsAppStatus
  } catch {
    return null
  }
}

// Upsert a status into the cache table.
export async function cacheWhatsAppStatus(phone: string, status: 'valid' | 'invalid'): Promise<void> {
  const normalized = normalizePhone(phone)
  if (!normalized) return

  try {
    const supabase = createAdminClient()
    await supabase
      .from('whatsapp_number_status')
      .upsert(
        { phone: normalized, status, checked_at: new Date().toISOString() },
        { onConflict: 'phone' }
      )
  } catch { /* non-critical */ }
}
