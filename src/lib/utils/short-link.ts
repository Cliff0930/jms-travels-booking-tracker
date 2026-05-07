import { createAdminClient } from '@/lib/supabase/server'

function randomCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, b => chars[b % chars.length]).join('')
}

export async function createShortLink(targetUrl: string, bookingId?: string): Promise<string> {
  const supabase = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://booking.jmstravels.net'

  for (let i = 0; i < 5; i++) {
    const code = randomCode()
    const { error } = await supabase.from('short_links').insert({
      code,
      target_url: targetUrl,
      booking_id: bookingId || null,
      // no expires_at — links live until used or booking cancelled
    })
    if (!error) return `${appUrl}/r/${code}`
  }

  return targetUrl
}

export async function markShortLinkUsed(code: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('short_links').update({ used_at: new Date().toISOString() }).eq('code', code)
}

export async function expireBookingLinks(bookingId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('short_links')
    .update({ used_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .is('used_at', null)
}
