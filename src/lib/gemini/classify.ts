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
  try {
    const parsed = JSON.parse(cleaned) as ClassificationResult
    const validClasses = ['booking', 'enquiry', 'junk', 'unclassified']
    if (!validClasses.includes(parsed.classification)) {
      console.error('[classify] unexpected classification value:', parsed.classification)
      return { classification: 'unclassified', confidence: 0, reason: 'unexpected value from model' }
    }
    return parsed
  } catch {
    console.error('[classify] Gemini returned invalid JSON:', cleaned.slice(0, 200))
    return { classification: 'unclassified', confidence: 0, reason: 'invalid JSON from model' }
  }
}
