'use client'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, MapPin, Car, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type StatusType = 'arrived' | 'completed'

function DriverStatusContent() {
  const searchParams = useSearchParams()
  const bookingId = searchParams.get('booking')
  const status = searchParams.get('status') as StatusType | null
  const token = searchParams.get('token')
  const linkCode = searchParams.get('link_code')

  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [tripsheetNumber, setTripsheetNumber] = useState('')
  const [openingKm, setOpeningKm] = useState('')
  const [closingKm, setClosingKm] = useState('')
  const [tollAmount, setTollAmount] = useState('')
  const [parkingAmount, setParkingAmount] = useState('')

  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState('')

  function captureGPS() {
    if (!navigator.geolocation) { setGpsError('GPS not supported on this device'); return }
    setGpsLoading(true)
    setGpsError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setGpsLoading(false) },
      () => { setGpsError('Could not capture location. Please enable GPS and try again.'); setGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function handleSubmit() {
    if (!bookingId || !status || !token) return
    setError('')

    if (status === 'arrived') {
      if (!tripsheetNumber.trim()) { setError('Please enter the tripsheet number'); return }
      if (!openingKm) { setError('Please enter the opening KM reading'); return }
    } else {
      if (!closingKm) { setError('Please enter the closing KM reading'); return }
    }

    setLoading(true)
    try {
      const body: Record<string, unknown> = { booking_id: bookingId, status, token, link_code: linkCode }
      if (status === 'arrived') {
        body.tripsheet_number = tripsheetNumber.trim()
        body.opening_km = parseFloat(openingKm)
      } else {
        body.closing_km = parseFloat(closingKm)
        if (tollAmount) body.toll_amount = parseFloat(tollAmount)
        if (parkingAmount) body.parking_amount = parseFloat(parkingAmount)
      }
      if (lat !== null) body.lat = lat
      if (lng !== null) body.lng = lng

      const res = await fetch('/api/driver-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Invalid or expired link')
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!bookingId || !status || !token) {
    return <p className="text-center text-[#737686]">Invalid link — please use the link sent by JMS Travels</p>
  }

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

      {done ? (
        <div className="flex flex-col items-center gap-3 text-center py-4">
          <CheckCircle className="w-14 h-14 text-green-500" />
          <p className="text-lg font-semibold text-[#191B23]">Status updated successfully</p>
          <p className="text-sm text-[#737686]">The operations team has been notified</p>
        </div>
      ) : (
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
            </>
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
              <div className="grid grid-cols-2 gap-3">
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
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Updating…' : status === 'arrived' ? 'Confirm Arrival' : 'Mark Trip Completed'}
          </Button>
        </div>
      )}
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
