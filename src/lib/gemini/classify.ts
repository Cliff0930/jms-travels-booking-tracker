import { getGeminiModel } from './client'
import { CLASSIFICATION_PROMPT } from './prompts'

export interface ClassificationResult {
  classification: 'booking' | 'enquiry' | 'junk' | 'unclassified'
  confidence: number
  reason: string
}

export async function classifyMessage(message: string): Promise<ClassificationResult> {
  const model = getGeminiModel()
  const prompt = CLASSIFICATION_PROMPT.replace('{message}', message)
  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()
  const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '')
  return JSON.parse(cleaned)
}
