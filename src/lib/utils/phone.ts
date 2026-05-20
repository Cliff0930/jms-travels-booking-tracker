// Normalize any phone format to WhatsApp E.164 without leading +.
// Handles Indian numbers (10-digit or with leading 0) and already-prefixed numbers.
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone?.trim()) return ''
  const digits = phone.replace(/\D/g, '')
  if (/^[6-9]\d{9}$/.test(digits)) return '91' + digits           // bare 10-digit Indian
  if (/^0[6-9]\d{9}$/.test(digits)) return '91' + digits.slice(1) // leading 0
  if (/^91[6-9]\d{9}$/.test(digits)) return digits                 // already 91 + 10-digit
  return digits || phone.trim()                                     // unknown — strip spaces at minimum
}
