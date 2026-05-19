import { getGeminiModel } from './client'
import { CONVERSATION_PROMPT } from './prompts'
import type { Client, ClientLocation } from '@/types'

export interface ModificationChange {
  field: 'pickup_time' | 'pickup_date' | 'pickup_location' | 'drop_location' | 'pax_count' | 'vehicle_type' | 'special_instructions'
  new_value: string
}

export interface ModificationRequest {
  changes: ModificationChange[]
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

function isComplete(result: ConversationResult): boolean {
  const ext = result.extracted
  if (!ext.pickup_location || !ext.pickup_date || !ext.pickup_time) return false
  if (ext.trip_type === 'outstation' && (!ext.drop_location || !ext.total_days || ext.total_days < 1)) return false
  // Airport: Gemini must set special_instructions (arrival + flight/terminal asked, or departure confirmed)
  if (ext.trip_type === 'airport' && !ext.special_instructions) return false
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

  let parsed: ConversationResult
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.error('[converse] invalid JSON from Gemini:', cleaned.slice(0, 200))
    return {
      intent: 'booking',
      extracted: {
        pickup_location: null, drop_location: null, pickup_date: null, pickup_time: null,
        pax_count: null, vehicle_type: null, guest_name: null, guest_phone: null,
        trip_type: 'local', service_type: 'one_way', total_days: 1,
        special_instructions: null, company_mentioned: null, booking_type: null,
      },
      modification_request: null, cancel_reason: null, target_booking_ref: null,
      missing_mandatory: ['pickup_location', 'pickup_date', 'pickup_time'],
      is_complete: false, is_new_booking_request: false,
      next_question: 'Sorry, I had trouble understanding that. Could you please share your pickup location, date, and time again?',
      is_guest_booking: false, new_keyword_detected: null, resolved_keywords: {}, confidence: 0,
    }
  }

  // Safety net: resolve any relative date words the LLM may have slipped through
  if (parsed.extracted?.pickup_date) {
    parsed.extracted.pickup_date = sanitizePickupDate(parsed.extracted.pickup_date, today)
    // Reject past dates — force client to give a future date
    if (parsed.extracted.pickup_date && parsed.extracted.pickup_date < today) {
      parsed.extracted.pickup_date = null
      if (!parsed.missing_mandatory.includes('pickup_date')) parsed.missing_mandatory.push('pickup_date')
      parsed.is_complete = false
      if (!parsed.next_question) parsed.next_question = 'The date you mentioned appears to be in the past. Could you share a future date for your booking?'
    }
  }
  if (parsed.modification_request?.changes) {
    for (const change of parsed.modification_request.changes) {
      if (change.field === 'pickup_date') {
        change.new_value = sanitizePickupDate(change.new_value, today) ?? change.new_value
      }
    }
  }

  const hasCompany = !!client?.company_id
  // Safety net: Gemini should never return null booking_type for corporate clients
  if (hasCompany && parsed.extracted && !parsed.extracted.booking_type) {
    parsed.extracted.booking_type = 'company'
  }

  // Code-level completeness check overrides LLM if it missed something
  if (parsed.intent === 'booking' && !isComplete(parsed)) {
    parsed.is_complete = false
  }

  return parsed
}
