import { NextRequest, NextResponse } from 'next/server'
import { getCachedWhatsAppStatus } from '@/lib/whatsapp/check-contact'

// GET /api/whatsapp/check-number?phone=xxx — read cache only
// Status is written retroactively by the webhook when a send fails with a non-WhatsApp error.
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ status: 'unknown' })

  const status = await getCachedWhatsAppStatus(phone)
  return NextResponse.json({ status: status ?? 'unknown' })
}
