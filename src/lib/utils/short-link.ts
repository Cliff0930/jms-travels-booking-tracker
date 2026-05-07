import { createAdminClient } from '@/lib/supabase/server'

function randomCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, b => chars[b % chars.length]).join('')
}

export async function createShortLink(targetUrl: string, expiresInHours = 48): Promise<string> {
  const supabase = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://booking.jmstravels.net'

  for (let i = 0; i < 5; i++) {
    const code = randomCode()
    const { error } = await supabase.from('short_links').insert({
      code,
      target_url: targetUrl,
      expires_at: new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString(),
    })
    if (!error) return `${appUrl}/r/${code}`
  }

  // Fallback: return the original URL if short link creation fails
  return targetUrl
}

export async function markShortLinkUsed(code: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('short_links').update({ used_at: new Date().toISOString() }).eq('code', code)
}
