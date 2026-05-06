'use client'
import { useEffect } from 'react'

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <p className="text-lg font-semibold text-[#191B23]">Something went wrong</p>
      <p className="text-sm text-[#737686] max-w-sm">
        {error.message?.includes('Loading chunk') || error.message?.includes('ChunkLoad')
          ? 'The app was updated. Please reload the page to continue.'
          : 'An unexpected error occurred. Try reloading or going back.'}
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-md text-sm font-medium bg-[#1A56DB] text-white hover:bg-[#003FB1]"
        >
          Reload page
        </button>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-md text-sm font-medium border border-[#C3C5D7] text-[#434654] hover:border-[#1A56DB]"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
