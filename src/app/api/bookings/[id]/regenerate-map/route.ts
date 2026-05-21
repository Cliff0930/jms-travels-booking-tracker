import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: gpsLogs } = await supabase
    .from('trip_gps_logs')
    .select('lat, lng')
    .eq('booking_id', id)
    .order('recorded_at', { ascending: true })

  if (!gpsLogs || gpsLogs.length < 2) {
    return NextResponse.json({ error: 'Not enough GPS points to generate a map (need at least 2)' }, { status: 400 })
  }

  const { data: sheet } = await supabase
    .from('trip_sheets')
    .select('id')
    .eq('booking_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!sheet) {
    return NextResponse.json({ error: 'No trip sheet found for this booking' }, { status: 404 })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Maps API key not configured' }, { status: 500 })

  const sample: typeof gpsLogs = []
  if (gpsLogs.length <= 100) {
    sample.push(...gpsLogs)
  } else {
    for (let i = 0; i < 100; i++) {
      sample.push(gpsLogs[Math.round(i * (gpsLogs.length - 1) / 99)])
    }
  }

  const path = sample.map(p => `${p.lat},${p.lng}`).join('|')
  const start = gpsLogs[0]
  const end = gpsLogs[gpsLogs.length - 1]
  const params2 = new URLSearchParams({
    size: '640x400',
    path: `color:0x1A56DBcc|weight:3|${path}`,
    markers: `color:green|label:S|${start.lat},${start.lng}`,
    key: apiKey,
  })
  const url = `https://maps.googleapis.com/maps/api/staticmap?${params2}&markers=color:red|label:E|${end.lat},${end.lng}`

  const imgRes = await fetch(url)
  if (!imgRes.ok) return NextResponse.json({ error: 'Google Maps API request failed' }, { status: 502 })

  const buffer = await imgRes.arrayBuffer()
  const fileName = `${id}/${sheet.id}.png`

  const { error: uploadError } = await supabase.storage
    .from('route-maps')
    .upload(fileName, buffer, { contentType: 'image/png', upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: publicUrlData } = supabase.storage.from('route-maps').getPublicUrl(fileName)
  await supabase.from('trip_sheets').update({ route_image_url: publicUrlData.publicUrl }).eq('id', sheet.id)

  return NextResponse.json({ ok: true, url: publicUrlData.publicUrl })
}
