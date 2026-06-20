import { getGeminiModel } from './client'
import { CLASSIFY_AND_EXTRACT_PROMPT } from './prompts'
import type { ExtractedBooking, ExtractionResult } from './extract'
import type { Client, ClientLocation } from '@/types'

export interface EmailModificationChange {
  field: 'pickup_time' | 'pickup_date' | 'pickup_location' | 'drop_location' | 'pax_count' | 'vehicle_type' | 'special_instructions'
  new_value: string
}

export interface ClassifyAndExtractResult extends ExtractionResult {
  classification: 'booking' | 'enquiry' | 'junk' | 'unclassified' | 'cancel_request' | 'modify_request'
  reason: string
  target_booking_ref: string | null
  cancel_reason: string | null
  modification_request: { changes: EmailModificationChange[]; booking_ref: string | null } | null
}

function getTodayIST(): string {
  const istOffset = 5.5 * 60 * 60 * 1000
  return new Date(Date.now() + istOffset).toISOString().slice(0, 10)
}

function getDayOfWeekIST(): string {
  const istOffset = 5.5 * 60 * 60 * 1000
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[new Date(Date.now() + istOffset).getUTCDay()]
}

const SAFE_EMPTY_BOOKING: ExtractedBooking = {
  extracted: {
    pickup_location: null, drop_location: null, pickup_date: null, pickup_time: null,
    pax_count: null, vehicle_type: null, guest_name: null, guest_phone: null,
    trip_type: 'local', service_type: 'one_way', total_days: 1,
    special_instructions: null, additional_phones: [], company_mentioned: null,
    department: null, pickup_stops: null,
  },
  missing_mandatory: ['pickup_location', 'pickup_date', 'pickup_time'],
  is_guest_booking: false,
}

function safeNonBookingResult(classification: ClassifyAndExtractResult['classification'], reason: string): ClassifyAndExtractResult {
  return { classification, confidence: 0.9, reason, bookings: [], resolved_keywords: {}, new_keyword_detected: null, target_booking_ref: null, cancel_reason: null, modification_request: null }
}

export async function classifyAndExtract(
  message: string,
  client: Client | null,
  savedLocations: ClientLocation[]
): Promise<ClassifyAndExtractResult> {
  const model = getGeminiModel()
  const clientProfile = client
    ? JSON.stringify({ name: client.name, default_pax: client.default_pax, default_vehicle_type: client.default_vehicle_type })
    : '{}'
  const locationsJson = JSON.stringify(savedLocations.map(l => ({ keyword: l.keyword, address: l.address })))
  const today = getTodayIST()
  const dayOfWeek = getDayOfWeekIST()
  const prompt = CLASSIFY_AND_EXTRACT_PROMPT
    .replace(/{today}/g, today)
    .replace(/{day_of_week}/g, dayOfWeek)
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
    console.error('[classify-and-extract] invalid JSON:', cleaned.slice(0, 200))
    return safeNonBookingResult('unclassified', 'invalid JSON from model')
  }

  const validClasses = ['booking', 'enquiry', 'junk', 'unclassified', 'cancel_request', 'modify_request']
  const classification = parsed.classification as string
  if (!validClasses.includes(classification)) {
    console.error('[classify-and-extract] unexpected classification:', classification)
    return safeNonBookingResult('unclassified', 'unexpected classification value')
  }

  if (classification === 'cancel_request' || classification === 'modify_request') {
    return {
      ...safeNonBookingResult(classification, (parsed.reason as string) ?? ''),
      target_booking_ref: (parsed.target_booking_ref as string | null) ?? null,
      cancel_reason: (parsed.cancel_reason as string | null) ?? null,
      modification_request: (parsed.modification_request as { changes: EmailModificationChange[]; booking_ref: string | null } | null) ?? null,
      _usage,
    }
  }

  if (classification !== 'booking') {
    return {
      ...safeNonBookingResult(
        classification as ClassifyAndExtractResult['classification'],
        (parsed.reason as string) ?? ''
      ),
      _usage,
    }
  }

  // Booking — normalise bookings array (same backwards-compat logic as extract.ts)
  let bookings: ExtractedBooking[]
  if (!parsed.bookings && parsed.extracted) {
    bookings = [{
      extracted: parsed.extracted as ExtractedBooking['extracted'],
      missing_mandatory: (parsed.missing_mandatory as string[]) ?? [],
      is_guest_booking: (parsed.is_guest_booking as boolean) ?? false,
    }]
  } else {
    bookings = (parsed.bookings as ExtractedBooking[]) ?? [SAFE_EMPTY_BOOKING]
  }

  return {
    classification: 'booking',
    confidence: (parsed.confidence as number) ?? 0.9,
    reason: (parsed.reason as string) ?? '',
    bookings,
    resolved_keywords: (parsed.resolved_keywords as Record<string, string>) ?? {},
    new_keyword_detected: (parsed.new_keyword_detected as string | null) ?? null,
    target_booking_ref: null,
    cancel_reason: null,
    modification_request: null,
    _usage,
  }
}
