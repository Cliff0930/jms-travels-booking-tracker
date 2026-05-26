import { createAdminClient } from '@/lib/supabase/server'

export async function sendDriverPushNotification(
  driverId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  const supabase = createAdminClient()
  const { data: rows } = await supabase
    .from('driver_push_tokens')
    .select('expo_push_token')
    .eq('driver_id', driverId)

  if (!rows?.length) return

  const messages = rows.map(({ expo_push_token }) => ({
    to: expo_push_token,
    title,
    body,
    sound: 'default',
    data: data ?? {},
  }))

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
  })
}
