import type { FeynmanEvaluationAssessment, FeynmanEvaluationInput, LLMProvider } from './llm-provider.js'
import { buildFeynmanEvaluationPrompt, parseFeynmanAssessment } from './feynman-evaluation.js'

export class GeminiLLMProvider implements LLMProvider {
  private apiKey: string
  private model: string

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey
    this.model = model || 'gemini-1.5-flash'
  }

  async evaluateFeynman(input: FeynmanEvaluationInput): Promise<FeynmanEvaluationAssessment> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildFeynmanEvaluationPrompt(input) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Gemini API error (${response.status}): ${errText}`)
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return parseFeynmanAssessment(rawContent)
  }
}
