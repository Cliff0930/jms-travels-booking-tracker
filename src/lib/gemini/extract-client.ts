import { getGeminiModel } from './client'

export interface ClientInfoResult {
  name: string | null
  company_name: string | null
  is_personal: boolean
}

const PROMPT = `Extract the sender's name and company from this WhatsApp message. Return JSON only.

Rules:
- name: their full name if mentioned anywhere, otherwise null
- company_name: company/organisation name if mentioned, otherwise null
- is_personal: true if they say "personal", "self", "my own use", "not work", "private", or similar

{"name": "string or null", "company_name": "string or null", "is_personal": boolean}

Message: {message}`

export async function extractClientInfo(message: string): Promise<ClientInfoResult> {
  try {
    const model = getGeminiModel()
    const result = await model.generateContent(PROMPT.replace('{message}', message))
    const text = result.response.text().trim().replace(/^```json\n?/, '').replace(/\n?```$/, '')
    return JSON.parse(text)
  } catch {
    return { name: null, company_name: null, is_personal: false }
  }
}
