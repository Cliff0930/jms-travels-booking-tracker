'use client'
import { Suspense, useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, MapPin, Car, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type StatusType = 'arrived' | 'completed'
type PageMode = 'form' | 'gps_active' | 'done'

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return hhmm
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`
}

function getGps(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000 },
    )
  })
}

function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  function parse(v: string) {
    const [hStr, mStr] = v.split(':')
    const h24 = parseInt(hStr) || 0
    return { hour: h24 % 12 || 12, minute: parseInt(mStr) || 0, period: (h24 >= 12 ? 'PM' : 'AM') as 'AM' | 'PM' }
  }
  const init = parse(value)
  const [hour, setHour] = useState(init.hour)
  const [minute, setMinute] = useState(init.minute)
  const [period, setPeriod] = useState<'AM' | 'PM'>(init.period)

  function emit(h: number, m: number, p: string) {
    let h24 = h % 12
    if (p === 'PM') h24 += 12
    onChange(`${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <select
        className="flex-1 min-w-0 h-12 rounded-lg border border-[#C3C5D7] text-base text-center bg-white text-[#191B23] font-semibold focus:outline-none focus:border-[#1A56DB]"
        value={hour}
        onChange={e => { const v = Number(e.target.value); setHour(v); emit(v, minute, period) }}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
          <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
        ))}
      </select>
      <span className="text-lg font-bold text-[#374151] select-none">:</span>
      <select
        className="flex-1 min-w-0 h-12 rounded-lg border border-[#C3C5D7] text-base text-center bg-white text-[#191B23] font-semibold focus:outline-none focus:border-[#1A56DB]"
        value={minute}
        onChange={e => { const v = Number(e.target.value); setMinute(v); emit(hour, v, period) }}
      >
        {Array.from({ length: 60 }, (_, i) => i).map(m => (
          <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
        ))}
      </select>
      <button
        type="button"
        className="shrink-0 w-14 h-12 rounded-lg bg-[#1A56DB] text-white font-bold text-sm tracking-wide active:bg-[#003FB1] transition-colors"
        onClick={() => { const p = period === 'AM' ? 'PM' : 'AM'; setPeriod(p as 'AM' | 'PM'); emit(hour, minute, p) }}
      >
        {period}
      </button>
    </div>
  )
}

function GpsPromptOverlay() {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-6">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center space-y-2">
        <div className="text-4xl">📍</div>
        <p className="font-semibold text-[#191B23]">Getting your location…</p>
        <p className="text-sm text-[#737686]">Tap Allow when your browser asks for location access</p>
      </div>
    </div>
  )
}

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
  const [openingTime, setOpeningTime] = useState(nowHHMM)

  // Completion form
  const [closingKm, setClosingKm] = useState('')
  const [closingTime, setClosingTime] = useState(nowHHMM)
  const [tollAmount, setTollAmount] = useState('')
  const [parkingAmount, setParkingAmount] = useState('')
  const [permitAmount, setPermitAmount] = useState('')
  const [collectionAmount, setCollectionAmount] = useState('')
  const [collectionMode, setCollectionMode] = useState<'cash' | 'phonepe' | 'gpay' | 'cc'>('cash')
  const [isSettlementDuty, setIsSettlementDuty] = useState(false)

  // Opening data for direct completed links
  const [serverOpeningKm, setServerOpeningKm] = useState<number | null>(null)
  const [serverOpeningTime, setServerOpeningTime] = useState<string | null>(null)
  const [alreadyDone, setAlreadyDone] = useState(false)

  // GPS
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [showGpsPrompt, setShowGpsPrompt] = useState(false)

  useEffect(() => {
    getGps().then(c => { if (c) setGpsCoords(c) })
  }, [])

  useEffect(() => {
    if (!bookingId || status !== 'completed') return
    fetch(`/api/bookings/${bookingId}`)
      .then(r => r.json())
      .then((b: { is_settlement_duty?: boolean }) => { if (b.is_settlement_duty) setIsSettlementDuty(true) })
      .catch(() => {})
  }, [bookingId, status])

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
        if (status === 'completed') {
          setServerOpeningKm(sheet.opening_km ?? null)
          setServerOpeningTime(sheet.manual_opening_time ?? null)
        }
      })
      .catch(() => {})
  }, [bookingId, legId, status])

  const completedTokenRef = useRef<string | null>(null)
  const isTrackingRef = useRef(false)

  function sendGpsPing() {
    if (!bookingId || !token || typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await fetch('/api/driver/gps-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking_id: bookingId, token, lat: pos.coords.latitude, lng: pos.coords.longitude }),
          })
        } catch { /* non-critical */ }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  function startGpsTracking() { isTrackingRef.current = true; sendGpsPing() }
  function stopGpsTracking() { isTrackingRef.current = false }

  useEffect(() => {
    if (mode !== 'gps_active') return
    const handleVisibility = () => {
      if (isTrackingRef.current && document.visibilityState === 'visible') sendGpsPing()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [mode])

  async function resolveGps(): Promise<{ lat: number; lng: number } | null> {
    if (gpsCoords) return gpsCoords
    setShowGpsPrompt(true)
    const coords = await getGps()
    setShowGpsPrompt(false)
    if (coords) setGpsCoords(coords)
    return coords
  }

  async function handleArrivedSubmit() {
    if (!bookingId || !token) return
    if (!tripsheetNumber.trim()) { setError('Please enter the tripsheet number'); return }
    if (!openingKm) { setError('Please enter the opening KM reading'); return }

    setError('')
    setLoading(true)
    try {
      const gps = await resolveGps()
      const body: Record<string, unknown> = {
        booking_id: bookingId, status: 'arrived', token,
        link_code: linkCode, leg_id: legId,
        tripsheet_number: tripsheetNumber.trim(),
        opening_km: parseFloat(openingKm),
        manual_opening_time: openingTime,
      }
      if (gps) { body.lat = gps.lat; body.lng = gps.lng }

      const res = await fetch('/api/driver-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Invalid or expired link')

      const data = await res.json() as { ok: boolean; gps_tracking_enabled?: boolean; completed_token?: string }

      if (data.gps_tracking_enabled && data.completed_token) {
        completedTokenRef.current = data.completed_token
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
    if (isSettlementDuty && (!collectionAmount || parseFloat(collectionAmount) <= 0)) {
      setError('Please enter the amount collected from the client'); return
    }

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
      const gps = await resolveGps()
      const body: Record<string, unknown> = {
        booking_id: bookingId, status: 'completed', token: useToken,
        link_code: linkCode, leg_id: legId,
        closing_km: parseFloat(closingKm),
        manual_closing_time: closingTime,
      }
      if (tollAmount) body.toll_amount = parseFloat(tollAmount)
      if (parkingAmount) body.parking_amount = parseFloat(parkingAmount)
      if (permitAmount) body.permit_amount = parseFloat(permitAmount)
      if (isSettlementDuty && collectionAmount) { body.collection_amount = parseFloat(collectionAmount); body.collection_mode = collectionMode }
      if (gps) { body.lat = gps.lat; body.lng = gps.lng }

      const res = await fetch('/api/driver-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Invalid or expired link')
      setMode('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      startGpsTracking()
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

  if (mode === 'done' && (status === 'completed' || closingKm)) {
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
              <span className="font-medium text-[#191B23]">{fmtTime(finalOpeningTime)}</span>
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
              <span className="font-medium text-[#191B23]">{fmtTime(closingTime)}</span>
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
      <>
        {showGpsPrompt && <GpsPromptOverlay />}
        <div className="flex flex-col gap-6 w-full max-w-sm mx-auto px-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <Radio className="w-8 h-8 text-green-600" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-[#191B23]">Trip In Progress</h1>
              <p className="text-[#434654] mt-1 text-sm">Fill in the details below when you complete the trip.</p>
            </div>
          </div>

          <div className="bg-[#F9F9FE] border border-[#C3C5D7] rounded-lg p-3 text-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#737686] mb-2">Trip Started With</p>
            <div className="flex justify-between">
              <span className="text-[#737686]">Opening KM</span>
              <span className="font-semibold text-[#191B23]">{openingKm ? parseFloat(openingKm).toLocaleString() : '—'}</span>
            </div>
            {openingTime && (
              <div className="flex justify-between mt-1">
                <span className="text-[#737686]">Opening Time</span>
                <span className="font-semibold text-[#191B23]">{fmtTime(openingTime)}</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
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
              <Label className="text-sm font-medium text-[#191B23]">Closing Time *</Label>
              <TimePicker value={closingTime} onChange={setClosingTime} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="toll_gps" className="text-sm font-medium text-[#191B23]">Toll <span className="font-normal text-[#737686]">(₹)</span></Label>
                <Input id="toll_gps" type="number" inputMode="decimal" value={tollAmount} onChange={e => setTollAmount(e.target.value)} placeholder="0" className="mt-1.5 border-[#C3C5D7] h-12 text-base" />
              </div>
              <div>
                <Label htmlFor="parking_gps" className="text-sm font-medium text-[#191B23]">Parking <span className="font-normal text-[#737686]">(₹)</span></Label>
                <Input id="parking_gps" type="number" inputMode="decimal" value={parkingAmount} onChange={e => setParkingAmount(e.target.value)} placeholder="0" className="mt-1.5 border-[#C3C5D7] h-12 text-base" />
              </div>
              <div>
                <Label htmlFor="permit_gps" className="text-sm font-medium text-[#191B23]">Permit <span className="font-normal text-[#737686]">(₹)</span></Label>
                <Input id="permit_gps" type="number" inputMode="decimal" value={permitAmount} onChange={e => setPermitAmount(e.target.value)} placeholder="0" className="mt-1.5 border-[#C3C5D7] h-12 text-base" />
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
      </>
    )
  }

  // Default: form mode
  return (
    <>
      {showGpsPrompt && <GpsPromptOverlay />}
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
                ? 'Fill in the details below before confirming arrival'
                : 'Enter the closing details to complete the trip'}
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
                <Label className="text-sm font-medium text-[#191B23]">Opening Time *</Label>
                <TimePicker value={openingTime} onChange={setOpeningTime} />
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
                  <span className="font-semibold text-[#191B23]">{fmtTime(serverOpeningTime)}</span>
                </div>
              )}
            </div>
          )}

          {status === 'completed' && (
            <>
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
                <Label className="text-sm font-medium text-[#191B23]">Closing Time *</Label>
                <TimePicker value={closingTime} onChange={setClosingTime} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="toll" className="text-sm font-medium text-[#191B23]">Toll <span className="font-normal text-[#737686]">(₹)</span></Label>
                  <Input id="toll" type="number" inputMode="decimal" value={tollAmount} onChange={e => setTollAmount(e.target.value)} placeholder="0" className="mt-1.5 border-[#C3C5D7] h-12 text-base" />
                </div>
                <div>
                  <Label htmlFor="parking" className="text-sm font-medium text-[#191B23]">Parking <span className="font-normal text-[#737686]">(₹)</span></Label>
                  <Input id="parking" type="number" inputMode="decimal" value={parkingAmount} onChange={e => setParkingAmount(e.target.value)} placeholder="0" className="mt-1.5 border-[#C3C5D7] h-12 text-base" />
                </div>
                <div>
                  <Label htmlFor="permit" className="text-sm font-medium text-[#191B23]">Permit <span className="font-normal text-[#737686]">(₹)</span></Label>
                  <Input id="permit" type="number" inputMode="decimal" value={permitAmount} onChange={e => setPermitAmount(e.target.value)} placeholder="0" className="mt-1.5 border-[#C3C5D7] h-12 text-base" />
                </div>
              </div>
            </>
          )}

          {isSettlementDuty && status === 'completed' && (
            <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 space-y-3">
              <p className="text-sm font-bold text-amber-800">⚠ Settlement Duty — Collect Payment from Client</p>
              <p className="text-xs text-amber-700">Enter the exact trip fare amount the client paid you (not toll/parking).</p>
              <div>
                <Label htmlFor="collection_amount" className="text-sm font-medium text-[#191B23]">Amount Collected (₹) *</Label>
                <Input id="collection_amount" type="number" inputMode="decimal" value={collectionAmount} onChange={e => setCollectionAmount(e.target.value)} placeholder="0" className="mt-1.5 border-amber-300 h-12 text-base" />
              </div>
              <div>
                <Label className="text-sm font-medium text-[#191B23] block mb-2">How did client pay? *</Label>
                <div className="flex gap-2 flex-wrap">
                  {(['cash', 'phonepe', 'gpay', 'cc'] as const).map(m => (
                    <button key={m} type="button" onClick={() => setCollectionMode(m)}
                      className={`px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${collectionMode === m ? 'bg-amber-700 text-white border-amber-700' : 'border-amber-300 text-amber-800 bg-white'}`}
                    >{{ cash: 'Cash', phonepe: 'PhonePe', gpay: 'GPay', cc: 'Card/CC' }[m]}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

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
    </>
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
