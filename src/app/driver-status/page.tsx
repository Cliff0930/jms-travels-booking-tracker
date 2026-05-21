'use client'
import { Suspense, useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, MapPin, Car, Navigation, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type StatusType = 'arrived' | 'completed'
type PageMode = 'form' | 'gps_active' | 'done'

const GPS_INTERVAL_MS = 30_000

function DriverStatusContent() {
  const searchParams = useSearchParams()
  const bookingId = searchParams.get('booking')
  const status = searchParams.get('status') as StatusType | null
  const token = searchParams.get('token')
  const linkCode = searchParams.get('link_code')
  const legId = searchParams.get('leg_id')

  const [mode, setMode] = useState<PageMode>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Arrived form
  const [tripsheetNumber, setTripsheetNumber] = useState('')
  const [openingKm, setOpeningKm] = useState('')
  const [openingTime, setOpeningTime] = useState('')

  // Completion form (shown in gps_active mode or for direct completed links)
  const [closingKm, setClosingKm] = useState('')
  const [closingTime, setClosingTime] = useState('')
  const [tollAmount, setTollAmount] = useState('')
  const [parkingAmount, setParkingAmount] = useState('')
  const [permitAmount, setPermitAmount] = useState('')

  // Single GPS capture (for arrived/completed without GPS tracking)
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState('')

  // Opening data for direct completed links (fetched from server)
  const [serverOpeningKm, setServerOpeningKm] = useState<number | null>(null)
  const [serverOpeningTime, setServerOpeningTime] = useState<string | null>(null)
  const [alreadyDone, setAlreadyDone] = useState(false)

  // On mount: check if this action was already submitted (prevents double-submission via browser back)
  useEffect(() => {
    if (!bookingId || !status) return
    type Sheet = { booking_leg_id: string | null; opening_time: string | null; closing_time: string | null; opening_km: number | null; manual_opening_time: string | null }
    fetch(`/api/bookings/${bookingId}/trip-sheet`)
      .then(r => r.json())
      .then((sheets: Sheet[]) => {
        if (!Array.isArray(sheets) || sheets.length === 0) return
        const sheet = legId
          ? sheets.find(s => s.booking_leg_id === legId)
          : (sheets.find(s => !s.booking_leg_id) ?? sheets[sheets.length - 1])
        if (!sheet) return
        if (status === 'arrived' && sheet.opening_time) { setAlreadyDone(true); return }
        if (status === 'completed' && sheet.closing_time) { setAlreadyDone(true); return }
        // Load opening data for the completed form
        if (status === 'completed') {
          setServerOpeningKm(sheet.opening_km ?? null)
          setServerOpeningTime(sheet.manual_opening_time ?? null)
        }
      })
      .catch(() => {})
  }, [bookingId, legId, status])

  // GPS tracking state (continuous, after arrived)
  const [gpsPings, setGpsPings] = useState(0)
  const completedTokenRef = useRef<string | null>(null)
  const trackingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function captureGPS() {
    if (!navigator.geolocation) { setGpsError('GPS not supported on this device'); return }
    setGpsLoading(true)
    setGpsError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setGpsLoading(false) },
      () => { setGpsError('Could not capture location. Enable GPS and try again.'); setGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function sendGpsPing() {
    if (!bookingId || !token) return
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await fetch('/api/driver/gps-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking_id: bookingId, token, lat: pos.coords.latitude, lng: pos.coords.longitude }),
          })
          setGpsPings(p => p + 1)
        } catch { /* non-critical */ }
      },
      () => { /* silent fail — GPS unavailable momentarily */ },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  function startGpsTracking() {
    if (!navigator.geolocation) return
    sendGpsPing() // immediate first ping
    trackingIntervalRef.current = setInterval(sendGpsPing, GPS_INTERVAL_MS)
  }

  function stopGpsTracking() {
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current)
      trackingIntervalRef.current = null
    }
  }

  // Cleanup on unmount
  useEffect(() => () => { if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current) }, [])

  async function handleArrivedSubmit() {
    if (!bookingId || !token) return
    if (!tripsheetNumber.trim()) { setError('Please enter the tripsheet number'); return }
    if (!openingKm) { setError('Please enter the opening KM reading'); return }

    setError('')
    setLoading(true)
    try {
      const body: Record<string, unknown> = {
        booking_id: bookingId, status: 'arrived', token,
        link_code: linkCode, leg_id: legId,
        tripsheet_number: tripsheetNumber.trim(),
        opening_km: parseFloat(openingKm),
      }
      if (openingTime) body.manual_opening_time = openingTime
      if (lat !== null) body.lat = lat
      if (lng !== null) body.lng = lng

      const res = await fetch('/api/driver-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Invalid or expired link')

      const data = await res.json() as { ok: boolean; gps_tracking_enabled?: boolean; completed_token?: string }

      if (data.gps_tracking_enabled && data.completed_token) {
        completedTokenRef.current = data.completed_token
        // Clear GPS coords so completed form captures fresh drop location, not stale pickup coords
        setLat(null)
        setLng(null)
        startGpsTracking()
        setMode('gps_active')
      } else {
        setMode('done')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleCompletedSubmit() {
    if (!bookingId) return
    if (!closingKm) { setError('Please enter the closing KM reading'); return }

    // Validate closing KM > opening KM
    const knownOpeningKm = openingKm ? parseFloat(openingKm) : serverOpeningKm
    if (knownOpeningKm != null && parseFloat(closingKm) <= knownOpeningKm) {
      setError(`Closing KM must be greater than opening KM (${knownOpeningKm.toLocaleString()})`)
      return
    }

    const useToken = completedTokenRef.current || token
    if (!useToken) return

    setError('')
    setLoading(true)
    stopGpsTracking()

    try {
      const body: Record<string, unknown> = {
        booking_id: bookingId, status: 'completed', token: useToken,
        link_code: linkCode, leg_id: legId,
        closing_km: parseFloat(closingKm),
      }
      if (closingTime) body.manual_closing_time = closingTime
      if (tollAmount) body.toll_amount = parseFloat(tollAmount)
      if (parkingAmount) body.parking_amount = parseFloat(parkingAmount)
      if (permitAmount) body.permit_amount = parseFloat(permitAmount)
      if (lat !== null) body.lat = lat
      if (lng !== null) body.lng = lng

      const res = await fetch('/api/driver-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Invalid or expired link')
      setMode('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      startGpsTracking() // resume tracking on failure
    } finally {
      setLoading(false)
    }
  }

  if (!bookingId || !status || !token) {
    return <p className="text-center text-[#737686]">Invalid link — please use the link sent by JMS Travels</p>
  }

  if (alreadyDone) {
    return (
      <div className="min-h-screen bg-[#FAF8FF] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-8 max-w-sm w-full text-center space-y-3">
          <div className="text-5xl mb-2">✅</div>
          <h2 className="text-lg font-semibold text-[#191B23]">
            {status === 'arrived' ? 'Trip Already Started' : 'Trip Already Completed'}
          </h2>
          <p className="text-sm text-[#737686] leading-relaxed">
            {status === 'arrived'
              ? 'You have already checked in for this trip. The trip is now in progress.'
              : 'You have already submitted the trip completion details.'}
          </p>
          <p className="text-xs text-[#9CA3AF]">For any changes, contact JMS Travels directly.</p>
        </div>
      </div>
    )
  }

  if (mode === 'done' && status === 'completed') {
    const finalOpeningKm = openingKm ? parseFloat(openingKm) : serverOpeningKm
    const finalClosingKm = closingKm ? parseFloat(closingKm) : null
    const totalKm = finalOpeningKm != null && finalClosingKm != null ? (finalClosingKm - finalOpeningKm) : null
    const finalOpeningTime = openingTime || serverOpeningTime
    const totalTime = finalOpeningTime && closingTime
      ? (() => {
          const [oh, om] = finalOpeningTime.split(':').map(Number)
          const [ch, cm] = closingTime.split(':').map(Number)
          let mins = (ch * 60 + cm) - (oh * 60 + om)
          if (mins < 0) mins += 24 * 60
          const h = Math.floor(mins / 60), m = mins % 60
          return m > 0 ? `${h}h ${m}m` : `${h}h`
        })()
      : null

    return (
      <div className="flex flex-col gap-5 w-full max-w-sm mx-auto px-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <CheckCircle className="w-14 h-14 text-green-500" />
          <p className="text-lg font-semibold text-[#191B23]">Trip Completed</p>
          <p className="text-sm text-[#737686]">The operations team has been notified</p>
        </div>

        <div className="bg-white border border-[#C3C5D7] rounded-xl p-4 space-y-2.5 text-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#434654] mb-1">Trip Summary</p>

          {finalOpeningKm != null && (
            <div className="flex justify-between">
              <span className="text-[#737686]">Opening KM</span>
              <span className="font-medium text-[#191B23]">{finalOpeningKm.toLocaleString()}</span>
            </div>
          )}
          {finalOpeningTime && (
            <div className="flex justify-between">
              <span className="text-[#737686]">Opening Time</span>
              <span className="font-medium text-[#191B23]">{finalOpeningTime}</span>
            </div>
          )}
          {finalClosingKm != null && (
            <div className="flex justify-between">
              <span className="text-[#737686]">Closing KM</span>
              <span className="font-medium text-[#191B23]">{finalClosingKm.toLocaleString()}</span>
            </div>
          )}
          {closingTime && (
            <div className="flex justify-between">
              <span className="text-[#737686]">Closing Time</span>
              <span className="font-medium text-[#191B23]">{closingTime}</span>
            </div>
          )}

          {(totalKm != null || totalTime) && (
            <div className="border-t border-[#E5E7EB] pt-2 mt-1 space-y-2">
              {totalKm != null && (
                <div className="flex justify-between">
                  <span className="font-semibold text-[#191B23]">Total KM</span>
                  <span className="font-bold text-[#1A56DB]">{totalKm.toFixed(1)} km</span>
                </div>
              )}
              {totalTime && (
                <div className="flex justify-between">
                  <span className="font-semibold text-[#191B23]">Total Time</span>
                  <span className="font-bold text-[#1A56DB]">{totalTime}</span>
                </div>
              )}
            </div>
          )}

          {(tollAmount || parkingAmount || permitAmount) && (
            <div className="border-t border-[#E5E7EB] pt-2 space-y-1.5">
              {tollAmount && (
                <div className="flex justify-between">
                  <span className="text-[#737686]">Toll</span>
                  <span className="text-[#434654]">₹{tollAmount}</span>
                </div>
              )}
              {parkingAmount && (
                <div className="flex justify-between">
                  <span className="text-[#737686]">Parking</span>
                  <span className="text-[#434654]">₹{parkingAmount}</span>
                </div>
              )}
              {permitAmount && (
                <div className="flex justify-between">
                  <span className="text-[#737686]">Permit</span>
                  <span className="text-[#434654]">₹{permitAmount}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (mode === 'done') {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-4">
        <CheckCircle className="w-14 h-14 text-green-500" />
        <p className="text-lg font-semibold text-[#191B23]">Status updated successfully</p>
        <p className="text-sm text-[#737686]">The operations team has been notified</p>
      </div>
    )
  }

  if (mode === 'gps_active') {
    return (
      <div className="flex flex-col gap-6 w-full max-w-sm mx-auto px-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <Radio className="w-8 h-8 text-green-600" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#191B23]">Trip In Progress</h1>
            <p className="text-[#434654] mt-1 text-sm">
              Keep this screen open. Fill in closing KM when done.
            </p>
          </div>
        </div>

        {/* Opening summary */}
        <div className="bg-[#F9F9FE] border border-[#C3C5D7] rounded-lg p-3 text-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#737686] mb-2">Trip Started With</p>
          <div className="flex justify-between">
            <span className="text-[#737686]">Opening KM</span>
            <span className="font-semibold text-[#191B23]">{openingKm ? parseFloat(openingKm).toLocaleString() : '—'}</span>
          </div>
          {openingTime && (
            <div className="flex justify-between mt-1">
              <span className="text-[#737686]">Opening Time</span>
              <span className="font-semibold text-[#191B23]">{openingTime}</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="closing_km_gps" className="text-sm font-medium text-[#191B23]">Closing KM *</Label>
              <Input
                id="closing_km_gps"
                type="number"
                inputMode="numeric"
                value={closingKm}
                onChange={e => setClosingKm(e.target.value)}
                placeholder="e.g. 45385"
                className="mt-1.5 border-[#C3C5D7] h-12 text-base"
              />
            </div>
            <div>
              <Label htmlFor="closing_time_gps" className="text-sm font-medium text-[#191B23]">Closing Time</Label>
              <Input
                id="closing_time_gps"
                type="time"
                value={closingTime}
                onChange={e => setClosingTime(e.target.value)}
                className="mt-1.5 border-[#C3C5D7] h-12 text-base"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="toll_gps" className="text-sm font-medium text-[#191B23]">Toll <span className="font-normal text-[#737686]">(₹)</span></Label>
              <Input
                id="toll_gps"
                type="number"
                inputMode="decimal"
                value={tollAmount}
                onChange={e => setTollAmount(e.target.value)}
                placeholder="0"
                className="mt-1.5 border-[#C3C5D7] h-12 text-base"
              />
            </div>
            <div>
              <Label htmlFor="parking_gps" className="text-sm font-medium text-[#191B23]">Parking <span className="font-normal text-[#737686]">(₹)</span></Label>
              <Input
                id="parking_gps"
                type="number"
                inputMode="decimal"
                value={parkingAmount}
                onChange={e => setParkingAmount(e.target.value)}
                placeholder="0"
                className="mt-1.5 border-[#C3C5D7] h-12 text-base"
              />
            </div>
            <div>
              <Label htmlFor="permit_gps" className="text-sm font-medium text-[#191B23]">Permit <span className="font-normal text-[#737686]">(₹)</span></Label>
              <Input
                id="permit_gps"
                type="number"
                inputMode="decimal"
                value={permitAmount}
                onChange={e => setPermitAmount(e.target.value)}
                placeholder="0"
                className="mt-1.5 border-[#C3C5D7] h-12 text-base"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 text-center bg-red-50 rounded-md py-2 px-3">{error}</p>}

          <Button
            className="w-full h-14 text-base font-semibold bg-[#1A56DB] hover:bg-[#003FB1] rounded-xl mt-2"
            onClick={handleCompletedSubmit}
            disabled={loading}
          >
            {loading ? 'Updating…' : 'Mark Trip Completed'}
          </Button>
        </div>
      </div>
    )
  }

  // Default: form mode
  return (
    <div className="flex flex-col gap-6 w-full max-w-sm mx-auto px-6">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full bg-[#D4DCFF] flex items-center justify-center">
          {status === 'arrived' ? <MapPin className="w-8 h-8 text-[#1A56DB]" /> : <Car className="w-8 h-8 text-[#1A56DB]" />}
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#191B23]">
            {status === 'arrived' ? 'I Have Arrived' : 'Trip Completed'}
          </h1>
          <p className="text-[#434654] mt-1 text-sm">
            {status === 'arrived'
              ? 'Fill in the details below before marking arrival'
              : 'Enter the closing KM to complete the trip'}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {status === 'arrived' && (
          <>
            <div>
              <Label htmlFor="tripsheet" className="text-sm font-medium text-[#191B23]">Tripsheet Number *</Label>
              <Input
                id="tripsheet"
                value={tripsheetNumber}
                onChange={e => setTripsheetNumber(e.target.value)}
                placeholder="e.g. TS-001"
                className="mt-1.5 border-[#C3C5D7] h-12 text-base"
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="opening_km" className="text-sm font-medium text-[#191B23]">Opening KM *</Label>
                <Input
                  id="opening_km"
                  type="number"
                  inputMode="numeric"
                  value={openingKm}
                  onChange={e => setOpeningKm(e.target.value)}
                  placeholder="e.g. 45230"
                  className="mt-1.5 border-[#C3C5D7] h-12 text-base"
                />
              </div>
              <div>
                <Label htmlFor="opening_time" className="text-sm font-medium text-[#191B23]">Opening Time</Label>
                <Input
                  id="opening_time"
                  type="time"
                  value={openingTime}
                  onChange={e => setOpeningTime(e.target.value)}
                  className="mt-1.5 border-[#C3C5D7] h-12 text-base"
                />
              </div>
            </div>
          </>
        )}

        {status === 'completed' && (serverOpeningKm != null || serverOpeningTime) && (
          <div className="bg-[#F9F9FE] border border-[#C3C5D7] rounded-lg p-3 text-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#737686] mb-2">Trip Started With</p>
            {serverOpeningKm != null && (
              <div className="flex justify-between">
                <span className="text-[#737686]">Opening KM</span>
                <span className="font-semibold text-[#191B23]">{serverOpeningKm.toLocaleString()}</span>
              </div>
            )}
            {serverOpeningTime && (
              <div className="flex justify-between mt-1">
                <span className="text-[#737686]">Opening Time</span>
                <span className="font-semibold text-[#191B23]">{serverOpeningTime}</span>
              </div>
            )}
          </div>
        )}

        {status === 'completed' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="closing_km" className="text-sm font-medium text-[#191B23]">Closing KM *</Label>
                <Input
                  id="closing_km"
                  type="number"
                  inputMode="numeric"
                  value={closingKm}
                  onChange={e => setClosingKm(e.target.value)}
                  placeholder="e.g. 45385"
                  className="mt-1.5 border-[#C3C5D7] h-12 text-base"
                />
              </div>
              <div>
                <Label htmlFor="closing_time" className="text-sm font-medium text-[#191B23]">Closing Time</Label>
                <Input
                  id="closing_time"
                  type="time"
                  value={closingTime}
                  onChange={e => setClosingTime(e.target.value)}
                  className="mt-1.5 border-[#C3C5D7] h-12 text-base"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="toll" className="text-sm font-medium text-[#191B23]">Toll <span className="font-normal text-[#737686]">(₹)</span></Label>
                <Input
                  id="toll"
                  type="number"
                  inputMode="decimal"
                  value={tollAmount}
                  onChange={e => setTollAmount(e.target.value)}
                  placeholder="0"
                  className="mt-1.5 border-[#C3C5D7] h-12 text-base"
                />
              </div>
              <div>
                <Label htmlFor="parking" className="text-sm font-medium text-[#191B23]">Parking <span className="font-normal text-[#737686]">(₹)</span></Label>
                <Input
                  id="parking"
                  type="number"
                  inputMode="decimal"
                  value={parkingAmount}
                  onChange={e => setParkingAmount(e.target.value)}
                  placeholder="0"
                  className="mt-1.5 border-[#C3C5D7] h-12 text-base"
                />
              </div>
              <div>
                <Label htmlFor="permit" className="text-sm font-medium text-[#191B23]">Permit <span className="font-normal text-[#737686]">(₹)</span></Label>
                <Input
                  id="permit"
                  type="number"
                  inputMode="decimal"
                  value={permitAmount}
                  onChange={e => setPermitAmount(e.target.value)}
                  placeholder="0"
                  className="mt-1.5 border-[#C3C5D7] h-12 text-base"
                />
              </div>
            </div>
          </>
        )}

        <div>
          <Label className="text-sm font-medium text-[#191B23]">Location <span className="font-normal text-[#737686]">(optional)</span></Label>
          <button
            type="button"
            onClick={captureGPS}
            disabled={gpsLoading}
            className={`mt-1.5 w-full flex items-center justify-center gap-2 h-12 rounded-md border text-sm font-medium transition-colors ${
              lat !== null
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-[#C3C5D7] bg-white text-[#434654] hover:bg-[#F3F3FE]'
            }`}
          >
            <Navigation className="w-4 h-4" />
            {gpsLoading ? 'Capturing location…' : lat !== null ? 'Location captured ✓' : 'Capture My Location'}
          </button>
          {gpsError && <p className="text-xs text-red-600 mt-1">{gpsError}</p>}
        </div>

        {error && <p className="text-sm text-red-600 text-center bg-red-50 rounded-md py-2 px-3">{error}</p>}

        <Button
          className="w-full h-14 text-base font-semibold bg-[#1A56DB] hover:bg-[#003FB1] rounded-xl mt-2"
          onClick={status === 'arrived' ? handleArrivedSubmit : handleCompletedSubmit}
          disabled={loading}
        >
          {loading ? 'Updating…' : status === 'arrived' ? 'Confirm Arrival' : 'Mark Trip Completed'}
        </Button>
      </div>
    </div>
  )
}

export default function DriverStatusPage() {
  return (
    <div className="min-h-screen bg-[#FAF8FF] flex items-center justify-center py-12">
      <Suspense fallback={<div className="text-[#737686]">Loading…</div>}>
        <DriverStatusContent />
      </Suspense>
    </div>
  )
}
