import { getGeminiModel } from './client'
import { EXTRACTION_PROMPT } from './prompts'
import type { Client, ClientLocation } from '@/types'

export interface ExtractedFields {
  pickup_location: string | null
  drop_location: string | null
  pickup_date: string | null
  pickup_time: string | null
  pax_count: number | null
  vehicle_type: string | null
  guest_name: string | null
  guest_phone: string | null
  trip_type: 'local' | 'outstation' | 'airport'
  service_type: 'one_way' | 'return'
  total_days: number
  special_instructions: string | null
  additional_phones: string[]
  company_mentioned: string | null
}

export interface ExtractedBooking {
  extracted: ExtractedFields
  missing_mandatory: string[]
  is_guest_booking: boolean
}

export interface ExtractionResult {
  bookings: ExtractedBooking[]
  resolved_keywords: Record<string, string>
  new_keyword_detected: string | null
  confidence: number
  _usage?: { tokens_in: number; tokens_out: number }
}

function getTodayIST(): string {
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const ist = new Date(now.getTime() + istOffset)
  return ist.toISOString().slice(0, 10)
}

export async function extractBookingFields(
  message: string,
  client: Client | null,
  savedLocations: ClientLocation[]
): Promise<ExtractionResult> {
  const model = getGeminiModel()
  const clientProfile = client
    ? JSON.stringify({ name: client.name, default_pax: client.default_pax, default_vehicle_type: client.default_vehicle_type })
    : '{}'
  const locationsJson = JSON.stringify(savedLocations.map(l => ({ keyword: l.keyword, address: l.address })))
  const today = getTodayIST()
  const prompt = EXTRACTION_PROMPT
    .replace(/{today}/g, today)
    .replace('{message}', message)
    .replace('{client_profile}', clientProfile)
    .replace('{saved_locations}', locationsJson)
  const result = await model.generateContent(prompt)
  const usage = result.response.usageMetadata
  const _usage = { tokens_in: usage?.promptTokenCount ?? 0, tokens_out: usage?.candidatesTokenCount ?? 0 }
  const text = result.response.text().trim()
  const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '')

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.error('[extract] Gemini returned invalid JSON:', cleaned.slice(0, 200))
    return {
      bookings: [{ extracted: { pickup_location: null, drop_location: null, pickup_date: null, pickup_time: null, pax_count: null, vehicle_type: null, guest_name: null, guest_phone: null, trip_type: 'local' as const, service_type: 'one_way' as const, total_days: 1, special_instructions: null, additional_phones: [], company_mentioned: null }, missing_mandatory: ['pickup_location', 'pickup_date', 'pickup_time'], is_guest_booking: false }],
      resolved_keywords: {},
      new_keyword_detected: null,
      confidence: 0,
      _usage,
    }
  }

  // Normalise: if Gemini returns old flat format, wrap it
  if (!parsed.bookings && parsed.extracted) {
    return {
      bookings: [{ extracted: parsed.extracted, missing_mandatory: (parsed.missing_mandatory as string[]) ?? [], is_guest_booking: (parsed.is_guest_booking as boolean) ?? false }],
      resolved_keywords: (parsed.resolved_keywords as Record<string, string>) ?? {},
      new_keyword_detected: (parsed.new_keyword_detected as string | null) ?? null,
      confidence: (parsed.confidence as number) ?? 0.9,
      _usage,
    } as ExtractionResult
  }
  return { ...(parsed as unknown as ExtractionResult), _usage }
}
