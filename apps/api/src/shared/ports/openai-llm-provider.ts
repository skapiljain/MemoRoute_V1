import type { FeynmanEvaluationAssessment, FeynmanEvaluationInput, LLMProvider } from './llm-provider.js'
import { buildFeynmanEvaluationPrompt, parseFeynmanAssessment } from './feynman-evaluation.js'

export class OpenAILLMProvider implements LLMProvider {
  private apiKey: string
  private baseUrl: string
  private model: string

  constructor(apiKey: string, baseUrl?: string, model?: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl || 'https://api.openai.com/v1'
    this.model = model || 'gpt-4o-mini'
  }

  async evaluateFeynman(input: FeynmanEvaluationInput): Promise<FeynmanEvaluationAssessment> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are LECTOR AI. Return only JSON matching the requested evaluation schema.',
          },
          { role: 'user', content: buildFeynmanEvaluationPrompt(input) },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`OpenAI API error (${response.status}): ${errText}`)
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const rawContent = data.choices?.[0]?.message?.content ?? ''
    return parseFeynmanAssessment(rawContent)
  }
}
