import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/utils/phone'

// Returns true if the given phone number has sent us a WhatsApp message in the
// last 24 hours — meaning Meta's customer service window is open and we can
// reply with free-form text instead of a paid template.
// Defaults to false (use template) on any error so delivery is never at risk.
export async function isWhatsAppWindowOpen(phone: string): Promise<boolean> {
  try {
    const normalized = normalizePhone(phone)
    if (!normalized) return false
    const supabase = createAdminClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('raw_messages')
      .select('id')
      .eq('channel', 'whatsapp')
      .eq('sender_phone', normalized)
      .gte('received_at', since)
      .limit(1)
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}
