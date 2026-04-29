'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, MapPin, Car } from 'lucide-react'
import { Button } from '@/components/ui/button'

type StatusType = 'arrived' | 'completed'

function DriverStatusContent() {
  const searchParams = useSearchParams()
  const bookingId = searchParams.get('booking')
  const status = searchParams.get('status') as StatusType | null
  const token = searchParams.get('token')

  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleTap() {
    if (!bookingId || !status || !token) return
    setLoading(true)
    try {
      const res = await fetch('/api/driver-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, status, token }),
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
    return <p className="text-center text-[#737686]">Invalid link</p>
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm mx-auto px-6">
      <div className="w-16 h-16 rounded-full bg-[#D4DCFF] flex items-center justify-center">
        {status === 'arrived' ? <MapPin className="w-8 h-8 text-[#1A56DB]" /> : <Car className="w-8 h-8 text-[#1A56DB]" />}
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[#191B23]">
          {status === 'arrived' ? 'Mark Arrived' : 'Mark Completed'}
        </h1>
        <p className="text-[#434654] mt-1">
          {status === 'arrived' ? 'Tap to confirm you have arrived at the pickup location' : 'Tap to confirm the trip is complete'}
        </p>
      </div>

      {done ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle className="w-12 h-12 text-green-500" />
          <p className="text-lg font-medium text-[#191B23]">Status updated successfully</p>
          <p className="text-sm text-[#737686]">The operations team has been notified</p>
        </div>
      ) : (
        <>
          <Button
            className="w-full h-14 text-lg bg-[#1A56DB] hover:bg-[#003FB1] rounded-xl"
            onClick={handleTap}
            disabled={loading}
          >
            {loading ? 'Updating…' : status === 'arrived' ? 'I Have Arrived' : 'Trip Completed'}
          </Button>
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        </>
      )}
    </div>
  )
}

export default function DriverStatusPage() {
  return (
    <div className="min-h-screen bg-[#FAF8FF] flex items-center justify-center">
      <Suspense fallback={<div className="text-[#737686]">Loading…</div>}>
        <DriverStatusContent />
      </Suspense>
    </div>
  )
}
