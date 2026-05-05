import { getGeminiModel } from './client'
import { CONVERSATION_PROMPT } from './prompts'
import type { Client, ClientLocation } from '@/types'

export interface ModificationRequest {
  field: 'pickup_time' | 'pickup_date' | 'pickup_location' | 'drop_location' | 'pax_count' | 'vehicle_type' | 'special_instructions' | null
  new_value: string | null
  booking_ref: string | null
}

export interface ConversationResult {
  intent: 'booking' | 'enquiry' | 'other' | 'cancel_request' | 'modify_request'
  extracted: {
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
    company_mentioned: string | null
    booking_type: 'company' | 'personal' | null
  }
  modification_request: ModificationRequest | null
  cancel_reason: string | null
  target_booking_ref: string | null
  missing_mandatory: string[]
  is_complete: boolean
  is_new_booking_request: boolean
  next_question: string | null
  is_guest_booking: boolean
  new_keyword_detected: string | null
  resolved_keywords: Record<string, string>
  confidence: number
}

function getTodayIST(): string {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  return ist.toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function sanitizePickupDate(raw: string | null, today: string): string | null {
  if (!raw) return null
  const lower = raw.toLowerCase().trim()
  if (lower === 'today') return today
  if (lower === 'tomorrow') return addDays(today, 1)
  if (lower === 'day after tomorrow' || lower === 'day-after-tomorrow') return addDays(today, 2)
  return raw
}

function isComplete(result: ConversationResult, hasCompany: boolean): boolean {
  const ext = result.extracted
  if (!ext.pickup_location || !ext.pickup_date || !ext.pickup_time) return false
  if (ext.trip_type === 'outstation' && (!ext.drop_location || !ext.total_days || ext.total_days < 1)) return false
  if (hasCompany && !ext.booking_type) return false
  return true
}

export async function converseBooking(
  messages: Array<{ role: 'client' | 'agent'; content: string; timestamp: string }>,
  client: Client | null,
  savedLocations: ClientLocation[]
): Promise<ConversationResult> {
  const model = getGeminiModel()
  const today = getTodayIST()
  const tomorrow = addDays(today, 1)

  const conversationText = messages
    .map(m => `${m.role === 'client' ? 'Client' : 'Agent'}: ${m.content}`)
    .join('\n')

  const clientProfile = client
    ? JSON.stringify({
        name: client.name,
        default_pax: client.default_pax,
        default_vehicle_type: client.default_vehicle_type,
        has_company: !!client.company_id,
      })
    : '{}'

  const locationsJson = JSON.stringify(
    savedLocations.map(l => ({ keyword: l.keyword, address: l.address }))
  )

  const prompt = CONVERSATION_PROMPT
    .replace(/{today}/g, today)
    .replace(/{tomorrow}/g, tomorrow)
    .replace('{conversation}', conversationText)
    .replace('{client_profile}', clientProfile)
    .replace('{saved_locations}', locationsJson)

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()
  const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '')
  const parsed: ConversationResult = JSON.parse(cleaned)

  // Safety net: resolve any relative date words the LLM may have slipped through
  if (parsed.extracted?.pickup_date) {
    parsed.extracted.pickup_date = sanitizePickupDate(parsed.extracted.pickup_date, today)
  }

  const hasCompany = !!client?.company_id
  // Code-level completeness check overrides LLM if it missed something
  if (parsed.intent === 'booking' && !isComplete(parsed, hasCompany)) {
    parsed.is_complete = false
  }

  return parsed
}
