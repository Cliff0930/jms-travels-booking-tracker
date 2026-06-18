import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyDriverToken, generateDriverToken } from '@/lib/utils/driver-token'
import { sendWhatsAppSmart } from '@/lib/whatsapp/send'
import { markShortLinkUsed } from '@/lib/utils/short-link'
import { totalDistanceKm } from '@/lib/utils/haversine'
import { sendPushToAll } from '@/lib/utils/push-notify'
import { logApiCost, calcMapsDistanceCost, calcMapsStaticCost } from '@/lib/api-costs'
import { formalName } from '@/lib/utils/client-name'

const MAPS_DAILY_LIMIT = 200

function getTodayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

async function getDistanceKm(
  origin: string,
  destination: string,
  supabase: ReturnType<typeof createAdminClient>,
  bookingId?: string
): Promise<number | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return null

  // Code-level daily cap — GCP free trial doesn't allow quota adjustment
  const counterKey = `maps_daily_count_${getTodayIST()}`
  const { data: counter } = await supabase.from('app_settings').select('value').eq('key', counterKey).single()
  const currentCount = parseInt(counter?.value || '0')
  if (currentCount >= MAPS_DAILY_LIMIT) {
    console.warn('[maps] daily limit reached:', currentCount, '— skipping distance call')
    return null
  }

  try {
    const params = new URLSearchParams({ origins: origin, destinations: destination, key: apiKey, units: 'metric' })
    const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`)
    const data = await res.json() as {
      rows?: Array<{ elements?: Array<{ status: string; distance?: { value: number } }> }>
    }
    const meters = data?.rows?.[0]?.elements?.[0]?.distance?.value
    if (typeof meters !== 'number') return null

    // Increment counter after successful call
    await supabase.from('app_settings').upsert({
      key: counterKey,
      value: String(currentCount + 1),
      updated_at: new Date().toISOString(),
    })

    logApiCost({ booking_id: bookingId, api_type: 'maps_distance', call_type: 'distance_matrix', cost_usd: calcMapsDistanceCost(), metadata: { origin, destination } }).catch(() => {})

    return Math.round(meters / 100) / 10
  } catch {
    return null
  }
}

async function generateAndSaveRouteMap(
  bookingId: string,
  sheetId: string,
  points: Array<{ lat: number; lng: number }>,
  supabase: ReturnType<typeof createAdminClient>
): Promise<void> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey || points.length < 2) return

  // Subsample to at most 100 points so the URL stays within limits
  const sample: typeof points = []
  if (points.length <= 100) {
    sample.push(...points)
  } else {
    for (let i = 0; i < 100; i++) {
      sample.push(points[Math.round(i * (points.length - 1) / 99)])
    }
  }

  const path = sample.map(p => `${p.lat},${p.lng}`).join('|')
  const start = points[0]
  const end = points[points.length - 1]
  const params = new URLSearchParams({
    size: '640x400',
    path: `color:0x1A56DBcc|weight:3|${path}`,
    markers: `color:green|label:S|${start.lat},${start.lng}`,
    key: apiKey,
  })
  // Second markers param — URLSearchParams deduplicates keys, build manually
  const url = `https://maps.googleapis.com/maps/api/staticmap?${params}&markers=color:red|label:E|${end.lat},${end.lng}`

  try {
    const imgRes = await fetch(url)
    if (!imgRes.ok) return

    const buffer = await imgRes.arrayBuffer()
    const fileName = `${bookingId}/${sheetId}.png`

    const { error } = await supabase.storage
      .from('route-maps')
      .upload(fileName, buffer, { contentType: 'image/png', upsert: true })

    if (error) { console.error('[route-map] storage upload error:', error.message); return }

    const { data: publicUrlData } = supabase.storage.from('route-maps').getPublicUrl(fileName)

    await supabase.from('trip_sheets').update({ route_image_url: publicUrlData.publicUrl }).eq('id', sheetId)
    logApiCost({ booking_id: bookingId, api_type: 'maps_static', call_type: 'route_map', cost_usd: calcMapsStaticCost() }).catch(() => {})
  } catch (err) {
    console.error('[route-map] generation error:', err)
  }
}

export async function POST(request: Request) {
  const {
    booking_id, status, token,
    tripsheet_number, opening_km, closing_km,
    manual_opening_time, manual_closing_time,
    toll_amount, parking_amount, permit_amount,
    lat, lng,
    link_code,
    leg_id,
    collection_amount,
    collection_mode,
    trip_closing_date,
  } = await request.json()
  const supabase = createAdminClient()

  if (!verifyDriverToken(booking_id, status, token)) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(id, name, primary_phone, salutation), driver:drivers(name, phone, vehicle_name, vehicle_number, vehicle_color), company:companies!company_id(pickup_origin_address, formal_address)')
    .eq('id', booking_id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  let newBookingStatus = status === 'arrived' ? 'in_progress' : 'completed'
  const driverStatus = status === 'arrived' ? 'on_duty' : 'available'

  // For multi-leg bookings: keep in_progress if more legs remain after this one
  if (status === 'completed' && leg_id) {
    const { data: allLegs } = await supabase
      .from('booking_legs')
      .select('id, day_number')
      .eq('booking_id', booking_id)
      .neq('leg_status', 'cancelled')

    if (allLegs && allLegs.length > 0) {
      const maxDay = Math.max(...allLegs.map(l => l.day_number))
      const thisLeg = allLegs.find(l => l.id === leg_id)
      if (thisLeg && thisLeg.day_number < maxDay) {
        newBookingStatus = 'in_progress'
      }
    }
  }

  await supabase.from('bookings').update({ status: newBookingStatus, updated_at: new Date().toISOString() }).eq('id', booking_id)
  await supabase.from('booking_status_history').insert({
    booking_id,
    old_status: booking.status,
    new_status: newBookingStatus,
    changed_by: 'driver',
  })
  if (booking.driver_id) {
    await supabase.from('drivers').update({ status: driverStatus }).eq('id', booking.driver_id)
  }

  // Trip sheet handling
  if (status === 'arrived') {
    let shouldInsert = true
    let adoptOrphanId: string | null = null

    if (leg_id) {
      // Check 1: already arrived for this leg — skip entirely
      const { data: legSheet } = await supabase
        .from('trip_sheets')
        .select('id')
        .eq('booking_id', booking_id)
        .eq('booking_leg_id', leg_id)
        .maybeSingle()

      if (legSheet) {
        shouldInsert = false
      } else {
        // Check 2: orphan tripsheet from booking-level link — adopt it instead of inserting
        const { data: orphan } = await supabase
          .from('trip_sheets')
          .select('id')
          .eq('booking_id', booking_id)
          .is('booking_leg_id', null)
          .is('closing_time', null)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (orphan) {
          adoptOrphanId = orphan.id
          shouldInsert = false
        }
      }
    }

    if (adoptOrphanId) {
      await supabase.from('trip_sheets').update({ booking_leg_id: leg_id }).eq('id', adoptOrphanId)
    } else if (shouldInsert) {
      // Auto-suffix duplicate tripsheet numbers: 2000 → 2000+1 → 2000+2
      let finalTripsheetNumber: string | null = tripsheet_number || null
      if (tripsheet_number) {
        const { data: existing } = await supabase
          .from('trip_sheets')
          .select('tripsheet_number')
          .or(`tripsheet_number.eq.${tripsheet_number},tripsheet_number.like.${tripsheet_number}+%`)
        if (existing && existing.length > 0) {
          finalTripsheetNumber = `${tripsheet_number}+${existing.length}`
        }
      }

      await supabase.from('trip_sheets').insert({
        booking_id,
        driver_id: booking.driver_id || null,
        booking_leg_id: leg_id || null,
        tripsheet_number: finalTripsheetNumber,
        opening_km: opening_km ?? null,
        opening_lat: lat ?? null,
        opening_lng: lng ?? null,
        opening_time: new Date().toISOString(),
        manual_opening_time: manual_opening_time || null,
        trip_opening_date: booking.trip_type === 'outstation' ? getTodayIST() : null,
      }).then(({ error }) => { if (error) console.error('trip_sheets insert error:', error.message) })
    }
  } else {
    // Find matching sheet: leg-specific if leg_id provided, otherwise most recent for booking
    let sheetQuery = supabase
      .from('trip_sheets')
      .select('id, opening_lat, opening_lng, trip_opening_date')
      .eq('booking_id', booking_id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (leg_id) {
      sheetQuery = sheetQuery.eq('booking_leg_id', leg_id)
    }

    const { data: sheet, error: sheetFindErr } = await sheetQuery.maybeSingle()
    if (sheetFindErr) console.error(`[driver-status] sheet lookup failed booking=${booking_id}:`, sheetFindErr.message)

    let officeToPickupKm: number | null = null
    let dropToOfficeKm: number | null = null

    const { data: distSetting } = await supabase.from('app_settings').select('value').eq('key', 'distance_calculation_enabled').single()
    const distEnabled = distSetting?.value !== 'false'

    if (distEnabled) {
      const company = booking.company as { pickup_origin_address?: string | null } | null
      const companyAddress = company?.pickup_origin_address?.trim() || null

      const { data: officeSetting } = await supabase.from('app_settings').select('value').eq('key', 'office_location').single()
      let jmsAddress: string | null = null
      if (officeSetting?.value) {
        try {
          const office = JSON.parse(officeSetting.value) as { address?: string }
          jmsAddress = office.address?.trim() || null
        } catch { /* non-critical */ }
      }

      const originAddress = companyAddress || jmsAddress
      if (originAddress) {
        if (sheet?.opening_lat && sheet?.opening_lng) {
          officeToPickupKm = await getDistanceKm(originAddress, `${sheet.opening_lat},${sheet.opening_lng}`, supabase, booking_id)
        }
        if (lat && lng) {
          dropToOfficeKm = await getDistanceKm(`${lat},${lng}`, originAddress, supabase, booking_id)
        }
      }
    }

    // GPS KM from continuous tracking logs
    let gpsKm: number | null = null
    const { data: gpsLogs } = await supabase
      .from('trip_gps_logs')
      .select('lat, lng')
      .eq('booking_id', booking_id)
      .order('recorded_at', { ascending: true })

    if (gpsLogs && gpsLogs.length >= 2) {
      gpsKm = totalDistanceKm(gpsLogs)
    }

    // For outstation: calculate actual days from opening/closing dates
    const tripType = booking.trip_type ?? 'local'
    const closingDateFinal = tripType === 'outstation' ? (trip_closing_date || getTodayIST()) : null
    const openingDate = (sheet as { trip_opening_date?: string | null } | null)?.trip_opening_date ?? null
    let outstationDays = tripType === 'outstation' ? (booking.total_days ?? 1) : 0
    if (tripType === 'outstation' && openingDate && closingDateFinal) {
      const diffMs = new Date(closingDateFinal).getTime() - new Date(openingDate).getTime()
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
      if (diffDays >= 0) outstationDays = diffDays + 1
    }
    // Update total_days from actual dates so billing is accurate
    if (tripType === 'outstation' && outstationDays > 0) {
      await supabase.from('bookings').update({ total_days: outstationDays }).eq('id', booking_id)
    }

    if (sheet) {
      const { error: updateErr } = await supabase.from('trip_sheets').update({
        closing_km: closing_km ?? null,
        closing_lat: lat ?? null,
        closing_lng: lng ?? null,
        closing_time: new Date().toISOString(),
        manual_closing_time: manual_closing_time || null,
        office_to_pickup_km: officeToPickupKm,
        drop_to_office_km: dropToOfficeKm,
        toll_amount: toll_amount ?? null,
        parking_amount: parking_amount ?? null,
        permit_amount: permit_amount ?? null,
        gps_km: gpsKm,
        trip_closing_date: closingDateFinal,
        updated_at: new Date().toISOString(),
      }).eq('id', sheet.id)
      if (updateErr) console.error(`[driver-status] trip_sheets update failed booking=${booking_id}:`, updateErr.message)

      // Generate route map in background — non-blocking
      if (gpsLogs && gpsLogs.length >= 2) {
        generateAndSaveRouteMap(booking_id, sheet.id, gpsLogs, supabase).catch(() => {})
      }
    } else {
      const { data: newSheet, error: insertErr } = await supabase.from('trip_sheets').insert({
        booking_id,
        driver_id: booking.driver_id || null,
        booking_leg_id: leg_id || null,
        closing_km: closing_km ?? null,
        closing_lat: lat ?? null,
        closing_lng: lng ?? null,
        closing_time: new Date().toISOString(),
        manual_closing_time: manual_closing_time || null,
        office_to_pickup_km: officeToPickupKm,
        drop_to_office_km: dropToOfficeKm,
        toll_amount: toll_amount ?? null,
        parking_amount: parking_amount ?? null,
        permit_amount: permit_amount ?? null,
        gps_km: gpsKm,
      }).select('id').single()
      if (insertErr) console.error(`[driver-status] trip_sheets insert failed booking=${booking_id}:`, insertErr.message)

      if (newSheet && gpsLogs && gpsLogs.length >= 2) {
        generateAndSaveRouteMap(booking_id, newSheet.id, gpsLogs, supabase).catch(() => {})
      }
    }
  }

  // Notify client
  const client = booking.client as { id?: string; name?: string; primary_phone?: string; salutation?: string | null } | null
  const driver = booking.driver as { name?: string; phone?: string; vehicle_name?: string; vehicle_number?: string; vehicle_color?: string } | null
  const guestPhone = booking.guest_phone || null
  const adminPhone = client?.primary_phone || null
  const dsCompany = booking.company as { pickup_origin_address?: string | null; formal_address?: boolean } | null
  const clientName = formalName(
    booking.guest_name || client?.name || 'there',
    booking.guest_name ? null : client?.salutation,
    dsCompany?.formal_address,
  )

  const phones = [guestPhone || adminPhone].filter(Boolean) as string[]

  if (phones.length > 0 && driver) {
    const vehicleLine = [driver.vehicle_name, driver.vehicle_color ? `(${driver.vehicle_color})` : null].filter(Boolean).join(' ')
    const vehicleInfo = [vehicleLine || driver.vehicle_name || '-', driver.vehicle_number ? `(${driver.vehicle_number})` : null].filter(Boolean).join(' ')

    if (status === 'arrived') {
      const fallbackBody = [
        `Hi ${clientName}, your driver ${driver.name} has arrived at your pickup location.`,
        ``,
        vehicleInfo ? `Vehicle: ${vehicleInfo}` : null,
        ``,
        `Please proceed to your pickup point. Safe travels! — JMS Travels`,
      ].filter(Boolean).join('\n')

      await Promise.all(phones.map(phone =>
        sendWhatsAppSmart({
          to: phone,
          templateName: 'jms_driver_arrived',
          params: [clientName, driver.name || '-', vehicleInfo || '-'],
          fallbackBody,
          log: { booking_id, client_id: client?.id || undefined, template_used: 'jms_driver_arrived' },
        })
      )).catch(() => {})
    } else {
      // Trip-completed client notification is currently disabled
    }
  }

  // Auto-insert collection entry if settlement duty and driver recorded collection
  if (status === 'completed' && booking.is_settlement_duty && collection_amount > 0 && collection_mode) {
    await supabase.from('driver_advances').insert({
      driver_id: booking.driver_id,
      booking_id: booking_id,
      type: 'collection',
      amount: collection_amount,
      payment_mode: collection_mode,
      note: `Client payment collected at trip completion – ${booking.booking_ref}`,
      status: 'outstanding',
    })
  }

  // Push notification to operator on trip completion (only when all legs are done)
  if (status === 'completed' && newBookingStatus === 'completed') {
    const driverObj = booking.driver as { name?: string } | null
    const driverName = driverObj?.name || 'Driver'
    const clientName2 = booking.guest_name || (booking.client as { name?: string } | null)?.name || ''
    const pushBody = [
      clientName2 ? `${clientName2}` : null,
      booking.pickup_location ? `From: ${booking.pickup_location}` : null,
      booking.drop_location ? `To: ${booking.drop_location}` : null,
      `Driver: ${driverName}`,
    ].filter(Boolean).join(' · ')
    const notifTitle = `✅ Trip Completed — ${booking.booking_ref}`
    void createAdminClient().from('operator_notifications').insert({ title: notifTitle, body: pushBody, channel: 'ops', url: `/bookings/${booking_id}` }).then(() => {}, () => {})
    sendPushToAll(notifTitle, pushBody, `/bookings/${booking_id}`).catch(() => {})
  }

  if (link_code) {
    await markShortLinkUsed(link_code).catch(() => {})
  }

  if (status === 'arrived') {
    return NextResponse.json({
      ok: true,
      gps_tracking_enabled: !!booking.gps_tracking_enabled,
      completed_token: booking.gps_tracking_enabled
        ? generateDriverToken(booking_id, 'completed')
        : undefined,
    })
  }

  return NextResponse.json({ ok: true })
}
