import { z } from 'zod'
import type { FeynmanEvaluationAssessment, FeynmanEvaluationInput } from './llm-provider.js'

const feynmanAssessmentSchema = z.object({
  correctness: z.number().int().min(0).max(100),
  clarity: z.number().int().min(0).max(100),
  completeness: z.number().int().min(0).max(100),
  feedback: z.object({
    strengths: z.array(z.string().min(1)).min(1).max(3),
    missingConcepts: z.array(z.string().min(1)).max(3),
    improvementTip: z.string().min(1),
  }),
  subConcepts: z.array(z.object({
    name: z.string().min(1),
    covered: z.boolean(),
    score: z.number().int().min(0).max(100),
  })).min(1).max(6),
  misconceptions: z.array(z.string().min(1)).max(3),
  nextPrompt: z.string().min(1),
})

export function buildFeynmanEvaluationPrompt(input: FeynmanEvaluationInput): string {
  return `You are LECTOR AI, an expert evaluator using the Feynman Technique. Evaluate only what the student explains, comparing it with the supplied source notes. Do not reward unsupported claims as correct.

TOPIC: ${input.topic}

SOURCE NOTES:
${input.sourceContent}

STUDENT EXPLANATION:
${input.userExplanation}

Score each dimension as an integer from 0 to 100:
- correctness: factual accuracy against the source; penalize misconceptions and unsupported claims.
- clarity: how understandable, well-structured, and jargon-aware the explanation is.
- completeness: coverage and explanation of the important concepts in the source; short or vague answers should score lower.

Identify 1-6 essential sub-concepts from the source notes, and score how well each is explained. Mark covered true only when the explanation demonstrates understanding, not merely mentions a term. List specific factual misconceptions, missing concepts, concise strengths, one actionable improvement tip, and one follow-up question for the largest gap.

Return only a JSON object with this exact shape. Do not include an overall score or a review interval; the application derives both from validated scores and the student's review history.
{
  "correctness": 0,
  "clarity": 0,
  "completeness": 0,
  "feedback": {
    "strengths": ["string"],
    "missingConcepts": [],
    "improvementTip": "string"
  },
  "subConcepts": [{ "name": "string", "covered": false, "score": 0 }],
  "misconceptions": [],
  "nextPrompt": "string"
}`
}

export function parseFeynmanAssessment(rawContent: string): FeynmanEvaluationAssessment {
  const cleanedJson = rawContent.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  let parsed: unknown

  try {
    parsed = JSON.parse(cleanedJson)
  } catch {
    throw new Error('LLM evaluation returned malformed JSON')
  }

  const validation = feynmanAssessmentSchema.safeParse(parsed)
  if (!validation.success) {
    throw new Error('LLM evaluation did not match the scoring contract')
  }

  return validation.data
}
