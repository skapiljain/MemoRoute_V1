import { describe, expect, it } from 'vitest'
import type { FeynmanEvaluationAssessment } from '../src/shared/ports/llm-provider.js'
import { parseFeynmanAssessment } from '../src/shared/ports/feynman-evaluation.js'
import { applyLectorCalibration } from '../src/shared/ports/lector-calibration.service.js'

const completeExplanation =
  'The learner explains the core concept, why it works, and how its parts relate using an example and accurate terminology. They also compare it with a second case, describe the important limitation, and connect the details back to the main idea.'

function assessment(overrides: Partial<FeynmanEvaluationAssessment> = {}): FeynmanEvaluationAssessment {
  return {
    correctness: 90,
    clarity: 80,
    completeness: 70,
    feedback: {
      strengths: ['Explains the central idea accurately'],
      missingConcepts: [],
      improvementTip: 'Add another example.',
    },
    subConcepts: [
      { name: 'Core idea', covered: true, score: 90 },
      { name: 'Application', covered: true, score: 80 },
    ],
    misconceptions: [],
    nextPrompt: 'How would this work in a different case?',
    ...overrides,
  }
}

describe('Feynman evaluation scoring contract', () => {
  it('derives a 0–10 score from the calibrated weighted dimensions', () => {
    const result = applyLectorCalibration(assessment(), completeExplanation)

    expect(result.lectorScore).toBe(8.3)
    expect(result.correctness).toBe(90)
    expect(result.clarity).toBe(80)
    expect(result.completeness).toBe(70)
  })

  it('preserves a valid zero score instead of replacing it with a high default', () => {
    const parsed = parseFeynmanAssessment(JSON.stringify(assessment({
      correctness: 0,
      clarity: 0,
      completeness: 0,
      subConcepts: [{ name: 'Core idea', covered: false, score: 0 }],
    })))
    const result = applyLectorCalibration(parsed, '')

    expect(result.lectorScore).toBe(0)
    expect(result.correctness).toBe(0)
    expect(result.clarity).toBe(0)
    expect(result.completeness).toBe(0)
  })

  it('rejects missing, out-of-range, and malformed provider output', () => {
    expect(() => parseFeynmanAssessment('{"correctness": 90}')).toThrow(
      'LLM evaluation did not match the scoring contract',
    )
    expect(() => parseFeynmanAssessment(JSON.stringify(assessment({ clarity: 101 })))).toThrow(
      'LLM evaluation did not match the scoring contract',
    )
    expect(() => parseFeynmanAssessment('{')).toThrow('LLM evaluation returned malformed JSON')
  })
})
