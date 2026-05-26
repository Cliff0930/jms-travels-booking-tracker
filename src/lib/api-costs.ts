import { createAdminClient } from '@/lib/supabase/server'

// Pricing constants (USD)
const GEMINI_25_FLASH_INPUT_PER_TOKEN = 0.075 / 1_000_000
const GEMINI_25_FLASH_OUTPUT_PER_TOKEN = 0.30 / 1_000_000
const MAPS_STATIC_PER_CALL = 0.002          // $2 / 1000 requests
const MAPS_DISTANCE_MATRIX_PER_ELEMENT = 0.005 // $5 / 1000 elements
// WhatsApp India utility template rate (Meta pricing, USD per conversation)
const WHATSAPP_UTILITY_PER_MSG = 0.0066

export type ApiType = 'gemini' | 'maps_static' | 'maps_distance' | 'whatsapp' | 'email'

export interface CostLogEntry {
  booking_id: string | null | undefined
  api_type: ApiType
  call_type: string
  tokens_in?: number
  tokens_out?: number
  cost_usd: number
  metadata?: Record<string, unknown>
}

export function calcGeminiCost(tokensIn: number, tokensOut: number): number {
  return tokensIn * GEMINI_25_FLASH_INPUT_PER_TOKEN + tokensOut * GEMINI_25_FLASH_OUTPUT_PER_TOKEN
}

export function calcMapsStaticCost(): number {
  return MAPS_STATIC_PER_CALL
}

export function calcMapsDistanceCost(elements = 1): number {
  return MAPS_DISTANCE_MATRIX_PER_ELEMENT * elements
}

export function calcWhatsAppCost(): number {
  return WHATSAPP_UTILITY_PER_MSG
}

export async function logApiCost(entry: CostLogEntry): Promise<void> {
  if (!entry.booking_id) return
  try {
    const supabase = createAdminClient()
    await supabase.from('api_usage_logs').insert({
      booking_id: entry.booking_id,
      api_type: entry.api_type,
      call_type: entry.call_type,
      tokens_in: entry.tokens_in ?? null,
      tokens_out: entry.tokens_out ?? null,
      cost_usd: entry.cost_usd,
      metadata: entry.metadata ?? null,
    })
  } catch {
    // non-critical — never fail the main flow
  }
}
