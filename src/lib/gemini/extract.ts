import { getGeminiModel } from './client'
import { EXTRACTION_PROMPT } from './prompts'
import type { Client, ClientLocation } from '@/types'

export interface ExtractionResult {
  extracted: {
    pickup_location: string | null
    drop_location: string | null
    pickup_date: string | null
    pickup_time: string | null
    pax_count: number | null
    vehicle_type: string | null
    guest_name: string | null
    guest_phone: string | null
    trip_type: 'local' | 'outstation'
    service_type: 'one_way' | 'return'
    total_days: number
    special_instructions: string | null
    additional_phones: string[]
    company_mentioned: string | null
  }
  missing_mandatory: string[]
  resolved_keywords: Record<string, string>
  new_keyword_detected: string | null
  is_guest_booking: boolean
  confidence: number
}

function getTodayIST(): string {
  // India Standard Time = UTC+5:30
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
  const text = result.response.text().trim()
  const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '')
  return JSON.parse(cleaned)
}
