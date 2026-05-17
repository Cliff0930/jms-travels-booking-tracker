/**
 * One-time archive backup endpoint.
 * Creates Google Drive spreadsheets for each financial year range.
 *
 * Trigger: GET /api/admin/archive-backup?secret=<CRON_SECRET>
 *
 * What it creates:
 *   1. "JMS Travels — FY 2025-26 Archive" (Apr 1 2025 – Mar 31 2026)
 *   2. "JMS Travels — Pre-FY Archive"     (before Apr 1 2025) — only if data exists
 *
 * After confirming both files in Google Drive, run the delete endpoint to
 * purge bookings created before Apr 1 2025.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { google } from 'googleapis'
import { notifyOperator } from '@/lib/utils/notify-operator'

function getDriveAuth() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!
  const jsonStr = keyRaw.trimStart().startsWith('{')
    ? keyRaw
    : Buffer.from(keyRaw, 'base64').toString('utf-8')
  const emailMatch = jsonStr.match(/"client_email"\s*:\s*"([^"]+)"/)
  const keyMatch   = jsonStr.match(/"private_key"\s*:\s*"([\s\S]*?)"(?:\s*,|\s*})/)
  if (!emailMatch || !keyMatch) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is incomplete')
  const privateKey = keyMatch[1].replace(/\\n/g, '\n')
  return new google.auth.JWT({
    email: emailMatch[1],
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
  })
}

function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

type BookingRow = Record<string, unknown>
type ClientRow  = Record<string, unknown>
type CompanyRow = Record<string, unknown>
type DriverRow  = Record<string, unknown>

function buildBookingRows(bookings: BookingRow[]) {
  return [
    ['Booking Ref', 'Client', 'Guest Name', 'Company', 'Driver', 'Vehicle', 'Plate', 'Pickup Location', 'Drop Location', 'Pickup Date', 'Pickup Time', 'Pax', 'Vehicle Type', 'Trip Type', 'Service', 'Status', 'Source', 'Special Instructions', 'Flags', 'Created At'],
    ...bookings.map(b => [
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
      b.pickup_time ? formatTime12h(b.pickup_time as string) : '',
      b.pax_count || '',
      b.vehicle_type || '',
      b.trip_type || '',
      b.service_type || '',
      b.status || '',
      b.source || '',
      b.special_instructions || '',
      ((b.flags as string[]) || []).join(', '),
      b.created_at,
    ]),
  ]
}

function buildClientRows(clients: ClientRow[]) {
  return [
    ['Name', 'Phone', 'Email', 'Company', 'Type', 'Designation', 'Default Pax', 'Default Vehicle', 'VIP', 'Verified', 'Notes', 'Created At'],
    ...clients.map(c => [
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
      c.notes || '',
      c.created_at,
    ]),
  ]
}

function buildCompanyRows(companies: CompanyRow[]) {
  return [
    ['Name', 'Email Domains', 'Approval Required', 'Approval Channel', 'Digest Mode', 'Created At'],
    ...companies.map(c => [
      c.name,
      ((c.email_domains as string[]) || []).join(', '),
      c.approval_required ? 'Yes' : 'No',
      c.approval_channel || '',
      c.digest_mode ? 'Yes' : 'No',
      c.created_at,
    ]),
  ]
}

function buildDriverRows(drivers: DriverRow[]) {
  return [
    ['Name', 'Phone', 'Email', 'Vehicle Type', 'Vehicle Name', 'Plate', 'Color', 'Capacity', 'Status', 'Active', 'Created At'],
    ...drivers.map(d => [
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
}

async function createArchiveSpreadsheet(
  drive: ReturnType<typeof google.drive>,
  sheets: ReturnType<typeof google.sheets>,
  folderId: string,
  title: string,
  bookingRows: unknown[][],
  clientRows: unknown[][],
  companyRows: unknown[][],
  driverRows: unknown[][],
): Promise<string> {
  const { data: spreadsheet } = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [folderId],
    },
  })
  if (!spreadsheet.id) throw new Error(`Failed to create spreadsheet: ${title}`)

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

  await Promise.all([
    sheets.spreadsheets.values.update({ spreadsheetId: spreadsheet.id, range: 'Bookings!A1',  valueInputOption: 'RAW', requestBody: { values: bookingRows } }),
    sheets.spreadsheets.values.update({ spreadsheetId: spreadsheet.id, range: 'Clients!A1',   valueInputOption: 'RAW', requestBody: { values: clientRows } }),
    sheets.spreadsheets.values.update({ spreadsheetId: spreadsheet.id, range: 'Companies!A1', valueInputOption: 'RAW', requestBody: { values: companyRows } }),
    sheets.spreadsheets.values.update({ spreadsheetId: spreadsheet.id, range: 'Drivers!A1',   valueInputOption: 'RAW', requestBody: { values: driverRows } }),
  ])

  return spreadsheet.id
}

export const maxDuration = 300

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const FY_2526_START = '2025-04-01T00:00:00.000Z'
  const FY_2526_END   = '2026-03-31T23:59:59.999Z'
  const PRE_FY_END    = '2025-03-31T23:59:59.999Z'

  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set on Vercel')
    if (!process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID) throw new Error('GOOGLE_DRIVE_BACKUP_FOLDER_ID is not set on Vercel')

    const auth   = getDriveAuth()
    const drive  = google.drive({ version: 'v3', auth })
    const sheets = google.sheets({ version: 'v4', auth })
    const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID

    // ── Purge ALL files in the backup folder owned by the service account ─────
    // This frees the service account's Drive quota before creating new files.
    const { data: existingFiles } = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 1000,
    })
    const purgeCount = existingFiles?.files?.length ?? 0
    await Promise.all((existingFiles?.files || []).map(f =>
      drive.files.delete({ fileId: f.id! }).catch(() => {})
    ))
    // ── Fetch master data (clients, companies, drivers — shared across sheets) ──
    const [{ data: allClients }, { data: allCompanies }, { data: allDrivers }] = await Promise.all([
      supabase.from('clients').select('*, company:companies!company_id(name)').order('created_at', { ascending: false }),
      supabase.from('companies').select('id, name, email_domains, approval_required, approval_channel, digest_mode, created_at').order('name'),
      supabase.from('drivers').select('*').order('name'),
    ])

    const clientRows  = buildClientRows(allClients  || [])
    const companyRows = buildCompanyRows(allCompanies || [])
    const driverRows  = buildDriverRows(allDrivers  || [])

    const results: Record<string, { id: string; bookings: number } | { skipped: true }> = {}

    // ── Sheet 1: FY 2025-26 (Apr 1 2025 – Mar 31 2026) ───────────────────────
    const { data: fy2526Bookings } = await supabase
      .from('bookings')
      .select('*, client:clients!client_id(name), company:companies(name), driver:drivers(name, vehicle_name, vehicle_number)')
      .gte('created_at', FY_2526_START)
      .lte('created_at', FY_2526_END)
      .order('created_at', { ascending: false })

    const fy2526Rows = buildBookingRows(fy2526Bookings || [])
    const fy2526Id = await createArchiveSpreadsheet(
      drive, sheets, folderId,
      'JMS Travels — FY 2025-26 Archive (Apr 2025 – Mar 2026)',
      fy2526Rows, clientRows, companyRows, driverRows,
    )
    results['FY 2025-26'] = { id: fy2526Id, bookings: fy2526Rows.length - 1 }

    // ── Sheet 2: Pre-FY 2025-26 (before Apr 1 2025) — only if data exists ────
    const { data: preFyBookings } = await supabase
      .from('bookings')
      .select('*, client:clients!client_id(name), company:companies(name), driver:drivers(name, vehicle_name, vehicle_number)')
      .lte('created_at', PRE_FY_END)
      .order('created_at', { ascending: false })

    if ((preFyBookings?.length ?? 0) > 0) {
      const preFyRows = buildBookingRows(preFyBookings!)
      const preFyId = await createArchiveSpreadsheet(
        drive, sheets, folderId,
        'JMS Travels — Pre-FY Archive (before Apr 2025)',
        preFyRows, clientRows, companyRows, driverRows,
      )
      results['Pre-FY 2024-25'] = { id: preFyId, bookings: preFyRows.length - 1 }
    } else {
      results['Pre-FY 2024-25'] = { skipped: true }
    }

    await notifyOperator(
      [
        `✅ Archive backup complete`,
        purgeCount > 0 ? `Cleared ${purgeCount} old file(s) from backup folder first` : null,
        `FY 2025-26: ${fy2526Rows.length - 1} bookings → Drive (${fy2526Id})`,
        (preFyBookings?.length ?? 0) > 0
          ? `Pre-FY: ${preFyBookings!.length} bookings → Drive`
          : `Pre-FY: no data found (nothing to archive)`,
        ``,
        `Check Google Drive to confirm files, then delete pre-Apr-2025 records via:`,
        `/api/admin/archive-delete?secret=<CRON_SECRET>`,
      ].join('\n')
    ).catch(() => {})

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    console.error('[archive-backup] error:', err)
    await notifyOperator(`🔴 Archive backup FAILED!\n\nError: ${String(err).slice(0, 300)}`).catch(() => {})
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
