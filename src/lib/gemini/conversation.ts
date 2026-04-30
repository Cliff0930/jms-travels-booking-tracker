import { getGeminiModel } from './client'
import { CONVERSATION_PROMPT } from './prompts'
import type { Client, ClientLocation, ConversationMessage } from '@/types'

export interface DayLeg {
  day: number
  date: string
  pickup_time: string | null
  pickup_location: string | null
  drop_location: string | null
}

export interface ConversationResult {
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
    day_legs: DayLeg[]
  }
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
  const istOffset = 5.5 * 60 * 60 * 1000
  return new Date(Date.now() + istOffset).toISOString().slice(0, 10)
}

function formatConversation(messages: ConversationMessage[]): string {
  return messages
    .map(m => `[${m.role === 'client' ? 'Client' : 'JMS Travels'}]: ${m.content}`)
    .join('\n')
}

export async function parseConversation(
  messages: ConversationMessage[],
  client: Client | null,
  savedLocations: ClientLocation[]
): Promise<ConversationResult> {
  const model = getGeminiModel()
  const today = getTodayIST()

  const clientProfile = client
    ? JSON.stringify({
        name: client.name,
        default_pax: client.default_pax,
        default_vehicle_type: client.default_vehicle_type,
      })
    : '{}'

  const locationsJson = JSON.stringify(
    savedLocations.map(l => ({ keyword: l.keyword, address: l.address }))
  )

  const conversation = formatConversation(messages)

  const prompt = CONVERSATION_PROMPT
    .replace(/{today}/g, today)
    .replace('{conversation}', conversation)
    .replace('{client_profile}', clientProfile)
    .replace('{saved_locations}', locationsJson)

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()

  // Strip markdown fences if present, then find the outermost JSON object
  const stripped = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`Gemini returned non-JSON: ${stripped.slice(0, 200)}`)
  const parsed: ConversationResult = JSON.parse(stripped.slice(start, end + 1))

  // Guard: reject past pickup_date
  if (parsed.extracted.pickup_date && parsed.extracted.pickup_date < today) {
    parsed.extracted.pickup_date = null
    if (!parsed.missing_mandatory.includes('pickup_date')) {
      parsed.missing_mandatory.push('pickup_date')
    }
    parsed.is_complete = false
  }

  return parsed
}
