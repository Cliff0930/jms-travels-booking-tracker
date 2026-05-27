import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/utils/phone'

export type WhatsAppStatus = 'valid' | 'invalid' | 'unknown'

const CACHE_DAYS = 30

// Check if a phone number is registered on WhatsApp via Meta's contacts API.
// Returns 'valid', 'invalid', or 'unknown' if the API is unavailable/inconclusive.
export async function checkWhatsAppContact(phone: string): Promise<WhatsAppStatus> {
  const normalized = normalizePhone(phone)
  if (!normalized) return 'unknown'

  const e164 = `+${normalized}`

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/contacts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blocking: 'wait',
          contacts: [e164],
          force_check: true,
        }),
      }
    )

    if (!res.ok) {
      console.warn(`[WA Check] contacts API returned ${res.status} for ${e164}`)
      return 'unknown'
    }

    const data = await res.json() as { contacts?: Array<{ status: string }> }
    const status = data.contacts?.[0]?.status
    if (status === 'valid') return 'valid'
    if (status === 'invalid') return 'invalid'
    return 'unknown'
  } catch (e) {
    console.warn('[WA Check] contacts API error:', e)
    return 'unknown'
  }
}

// Read cached status. Returns null if no entry or entry is older than CACHE_DAYS.
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

// Check cache first; call API only if no fresh cache entry.
// Writes result to cache if API returns a definitive answer.
export async function checkAndCacheWhatsApp(phone: string): Promise<WhatsAppStatus> {
  const cached = await getCachedWhatsAppStatus(phone)
  if (cached !== null) return cached

  const status = await checkWhatsAppContact(phone)
  if (status !== 'unknown') {
    await cacheWhatsAppStatus(phone, status)
  }
  return status
}
