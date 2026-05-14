import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { google } from 'googleapis'
import { notifyOperator } from '@/lib/utils/notify-operator'

function getAuthClient() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!
  // Decode base64 if needed
  const jsonStr = keyRaw.trimStart().startsWith('{')
    ? keyRaw
    : Buffer.from(keyRaw, 'base64').toString('utf-8')

  // Regex extraction avoids JSON.parse entirely — no control-char issues
  // PEM keys only have base64 + dashes + spaces + newlines, never contain "
  const emailMatch = jsonStr.match(/"client_email"\s*:\s*"([^"]+)"/)
  const keyMatch   = jsonStr.match(/"private_key"\s*:\s*"([\s\S]*?)"(?:\s*,|\s*})/)

  if (!emailMatch || !keyMatch) {
    const len = jsonStr.length
    const prefix = jsonStr.slice(0, 30).replace(/[^\x20-\x7E]/g, '?')
    const hasEmail = jsonStr.includes('client_email')
    const hasKey = jsonStr.includes('private_key')
    throw new Error(
      `Cannot parse key — len=${len}, starts="${prefix}", hasEmail=${hasEmail}, hasKey=${hasKey}, rawStarts="${keyRaw.slice(0, 8)}"`
    )
  }

  // Handle both \n escape sequences and literal newlines
  const privateKey = keyMatch[1].replace(/\\n/g, '\n')

  return new google.auth.JWT({
    email: emailMatch[1],
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
  })
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized', _v: 6 }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    let auth: ReturnType<typeof getAuthClient>
    try {
      auth = getAuthClient()
    } catch (authErr) {
      return NextResponse.json({ error: `[AUTH] ${String(authErr)}` }, { status: 500 })
    }
    const drive = google.drive({ version: 'v3', auth })
    const sheets = google.sheets({ version: 'v4', auth })
    const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID!

    // ── Step 1: Delete backups older than 60 days ──────────────────────────
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 60)
    const { data: oldFiles } = await drive.files.list({
      q: `'${folderId}' in parents and createdTime < '${cutoffDate.toISOString()}' and trashed = false`,
      fields: 'files(id, name)',
    })
    const deletedCount = oldFiles?.files?.length ?? 0
    await Promise.all((oldFiles?.files || []).map(f => drive.files.delete({ fileId: f.id! }).catch(() => {})))

    // ── Step 2: Fetch all tables in parallel ───────────────────────────────
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const dateFrom = thirtyDaysAgo.toISOString().split('T')[0]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [{ data: bookings }, { data: clients }, { data: companies }, { data: drivers }]: any[] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, client:clients!client_id(name), company:companies(name), driver:drivers(name, vehicle_name, vehicle_number)')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('clients')
        .select('*, company:companies!company_id(name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('companies')
        .select('id, name, email_domains, approval_required, approval_channel, digest_mode, created_at')
        .order('name'),
      supabase
        .from('drivers')
        .select('*')
        .order('name'),
    ])

    // ── Step 3: Build row arrays ────────────────────────────────────────────
    const bookingRows = [
      ['Booking Ref', 'Client', 'Guest Name', 'Company', 'Driver', 'Vehicle', 'Plate', 'Pickup', 'Drop', 'Date', 'Time', 'Pax', 'Vehicle Type', 'Trip Type', 'Service', 'Status', 'Source', 'Flags', 'Created At'],
      ...(bookings || []).map((b: Record<string, unknown>) => [
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
        ((b.flags as string[]) || []).join(', '),
        b.created_at,
      ]),
    ]

    const clientRows = [
      ['Name', 'Phone', 'Email', 'Company', 'Type', 'Designation', 'Default Pax', 'Default Vehicle', 'VIP', 'Verified', 'Created At'],
      ...(clients || []).map((c: Record<string, unknown>) => [
        c.name,
        c.primary_phone || '',
        c.primary_email || '',
        (c.company as { name: string } | null)?.name || '',
        c.client_type || '',
        c.designation || '',
        c.default_pax || '',
        c.default_vehicle_type || '',
        c.is_vip ? 'Yes' : 'No',
        c.is_verified ? 'Yes' : 'No',
        c.created_at,
      ]),
    ]

    const companyRows = [
      ['Name', 'Email Domains', 'Approval Required', 'Approval Channel', 'Digest Mode', 'Created At'],
      ...(companies || []).map((c: Record<string, unknown>) => [
        c.name,
        ((c.email_domains as string[]) || []).join(', '),
        c.approval_required ? 'Yes' : 'No',
        c.approval_channel || '',
        c.digest_mode ? 'Yes' : 'No',
        c.created_at,
      ]),
    ]

    const driverRows = [
      ['Name', 'Phone', 'Email', 'Vehicle Type', 'Vehicle Name', 'Plate', 'Color', 'Capacity', 'Status', 'Active', 'Created At'],
      ...(drivers || []).map((d: Record<string, unknown>) => [
        d.name,
        d.phone,
        d.email || '',
        d.vehicle_type,
        d.vehicle_name,
        d.vehicle_number,
        d.vehicle_color || '',
        d.seating_capacity,
        d.status,
        d.is_active ? 'Yes' : 'No',
        d.created_at,
      ]),
    ]

    // ── Step 4: Create spreadsheet in Drive ────────────────────────────────
    const today = new Date().toISOString().split('T')[0]
    const title = `JMS Travels Backup — ${today} (bookings from ${dateFrom})`

    const { data: spreadsheet } = await drive.files.create({
      requestBody: {
        name: title,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [folderId],
      },
    })

    if (!spreadsheet.id) throw new Error('Failed to create spreadsheet in Drive')

    // Find the default sheet ID so we can rename it to "Bookings"
    const { data: ssInfo } = await sheets.spreadsheets.get({ spreadsheetId: spreadsheet.id })
    const defaultSheetId = ssInfo.sheets?.[0]?.properties?.sheetId ?? 0

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheet.id,
      requestBody: {
        requests: [
          { updateSheetProperties: { properties: { sheetId: defaultSheetId, title: 'Bookings' }, fields: 'title' } },
          { addSheet: { properties: { title: 'Clients' } } },
          { addSheet: { properties: { title: 'Companies' } } },
          { addSheet: { properties: { title: 'Drivers' } } },
        ],
      },
    })

    // Write all 4 sheets in parallel
    await Promise.all([
      sheets.spreadsheets.values.update({ spreadsheetId: spreadsheet.id, range: 'Bookings!A1', valueInputOption: 'RAW', requestBody: { values: bookingRows } }),
      sheets.spreadsheets.values.update({ spreadsheetId: spreadsheet.id, range: 'Clients!A1',  valueInputOption: 'RAW', requestBody: { values: clientRows } }),
      sheets.spreadsheets.values.update({ spreadsheetId: spreadsheet.id, range: 'Companies!A1', valueInputOption: 'RAW', requestBody: { values: companyRows } }),
      sheets.spreadsheets.values.update({ spreadsheetId: spreadsheet.id, range: 'Drivers!A1',  valueInputOption: 'RAW', requestBody: { values: driverRows } }),
    ])

    // ── Step 5: Notify operator of success ─────────────────────────────────
    notifyOperator(
      [
        `✅ Daily backup complete`,
        `Bookings: ${bookingRows.length - 1} (last 30 days)`,
        `Clients: ${clientRows.length - 1}`,
        `Companies: ${companyRows.length - 1}`,
        `Drivers: ${driverRows.length - 1}`,
        deletedCount > 0 ? `Deleted ${deletedCount} old backup(s)` : null,
      ].filter(Boolean).join('\n')
    ).catch(() => {})

    return NextResponse.json({
      ok: true,
      spreadsheetId: spreadsheet.id,
      title,
      counts: {
        bookings: bookingRows.length - 1,
        clients: clientRows.length - 1,
        companies: companyRows.length - 1,
        drivers: driverRows.length - 1,
        deleted_old_backups: deletedCount,
      },
    })
  } catch (err) {
    console.error('[backup-cron] error:', err)
    await notifyOperator(
      `🔴 Daily backup FAILED!\n\nError: ${String(err).slice(0, 300)}\n\nCheck Vercel logs → Cron for details.`
    ).catch(() => {})
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
