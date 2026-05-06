import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { google } from 'googleapis'

function getAuthClient() {
  const keyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!
  const keyJson = JSON.parse(Buffer.from(keyBase64, 'base64').toString())
  return new google.auth.JWT({
    email: keyJson.client_email,
    key: keyJson.private_key,
    scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
  })
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const dateFrom = thirtyDaysAgo.toISOString().split('T')[0]

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(name), company:companies(name), driver:drivers(name, vehicle_name, vehicle_number)')
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = [
    ['Booking Ref', 'Client', 'Guest Name', 'Company', 'Driver', 'Vehicle', 'Plate', 'Pickup', 'Drop', 'Date', 'Time', 'Pax', 'Vehicle Type', 'Trip Type', 'Service', 'Status', 'Source', 'Flags', 'Created At'],
    ...(bookings || []).map(b => [
      b.booking_ref,
      (b.client as { name: string } | null)?.name || '',
      b.guest_name || '',
      (b.company as { name: string } | null)?.name || '',
      (b.driver as { name: string; vehicle_name: string; vehicle_number: string } | null)?.name || '',
      (b.driver as { name: string; vehicle_name: string; vehicle_number: string } | null)?.vehicle_name || '',
      (b.driver as { name: string; vehicle_name: string; vehicle_number: string } | null)?.vehicle_number || '',
      b.pickup_location || '',
      b.drop_location || '',
      b.pickup_date || '',
      b.pickup_time || '',
      b.pax_count || '',
      b.vehicle_type || '',
      b.trip_type,
      b.service_type,
      b.status,
      b.source,
      (b.flags || []).join(', '),
      b.created_at,
    ])
  ]

  const auth = getAuthClient()
  const drive = google.drive({ version: 'v3', auth })
  const sheets = google.sheets({ version: 'v4', auth })

  const title = `JMS Travels Backup — ${new Date().toISOString().split('T')[0]} (last 30 days from ${dateFrom})`

  const { data: spreadsheet } = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID!],
    },
  })

  if (!spreadsheet.id) {
    return NextResponse.json({ error: 'Failed to create spreadsheet' }, { status: 500 })
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheet.id,
    range: 'Sheet1!A1',
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  })

  return NextResponse.json({ ok: true, rows: rows.length - 1, spreadsheetId: spreadsheet.id, title })
}
