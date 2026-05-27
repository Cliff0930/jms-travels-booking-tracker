import { NextRequest, NextResponse } from 'next/server'
import { checkAndCacheWhatsApp, getCachedWhatsAppStatus } from '@/lib/whatsapp/check-contact'

// GET /api/whatsapp/check-number?phone=xxx — read cache only, no API call
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ status: 'unknown' })

  const status = await getCachedWhatsAppStatus(phone)
  return NextResponse.json({ status: status ?? 'unknown' })
}

// POST /api/whatsapp/check-number — trigger fresh check and cache result
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { phone?: string }
    if (!body.phone) return NextResponse.json({ status: 'unknown' })

    const status = await checkAndCacheWhatsApp(body.phone)
    return NextResponse.json({ status })
  } catch {
    return NextResponse.json({ status: 'unknown' })
  }
}
