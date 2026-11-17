import { describe, expect, it } from 'vitest'
import { env } from '../src/config/env.js'
import {
  FEATURE_FLAGS,
  getAllFlags,
  hashUserForFlag,
  isFlagEnabled,
} from '../src/config/flags.js'

describe('Feature Flags & Rollout', () => {
  it('defines all required Phase 0 flags', () => {
    expect(FEATURE_FLAGS).toContain('TRANSCRIPT_CONFIRM')
    expect(FEATURE_FLAGS).toContain('CHUNKED_RAG')
    expect(FEATURE_FLAGS).toContain('GROUNDED_EVALUATOR')
    expect(FEATURE_FLAGS).toContain('CONCEPT_RETENTION')
    expect(FEATURE_FLAGS).toContain('ASYNC_PIPELINE')
  })

  it('computes deterministic hashes for user and flag', () => {
    const hash1 = hashUserForFlag('user_123', 'TRANSCRIPT_CONFIRM')
    const hash2 = hashUserForFlag('user_123', 'TRANSCRIPT_CONFIRM')
    const hash3 = hashUserForFlag('user_456', 'TRANSCRIPT_CONFIRM')

    expect(hash1).toBe(hash2)
    expect(typeof hash1).toBe('number')
    expect(hash1).toBeGreaterThanOrEqual(0)
    expect(hash1).toBeLessThan(100)
    // Different user should generally produce different hash
    expect(typeof hash3).toBe('number')
  })

  it('respects boolean env flag override', () => {
    env.FLAG_CHUNKED_RAG = true
    expect(isFlagEnabled('CHUNKED_RAG')).toBe(true)
    expect(isFlagEnabled('CHUNKED_RAG', 'any_user')).toBe(true)

    env.FLAG_CHUNKED_RAG = false
    env.FLAG_CHUNKED_RAG_PERCENT = 0
    expect(isFlagEnabled('CHUNKED_RAG')).toBe(false)
  })

  it('performs percentage-based rollout deterministically', () => {
    env.FLAG_GROUNDED_EVALUATOR = false
    env.FLAG_GROUNDED_EVALUATOR_PERCENT = 50

    const userHash = hashUserForFlag('test_user_abc', 'GROUNDED_EVALUATOR')
    const expected = userHash < 50

    expect(isFlagEnabled('GROUNDED_EVALUATOR', 'test_user_abc')).toBe(expected)

    // At 100%, always enabled
    env.FLAG_GROUNDED_EVALUATOR_PERCENT = 100
    expect(isFlagEnabled('GROUNDED_EVALUATOR', 'test_user_abc')).toBe(true)

    // At 0%, always disabled if boolean flag is false
    env.FLAG_GROUNDED_EVALUATOR_PERCENT = 0
    expect(isFlagEnabled('GROUNDED_EVALUATOR', 'test_user_abc')).toBe(false)
  })

  it('returns all flags from getAllFlags', () => {
    const all = getAllFlags('user_test')
    for (const flag of FEATURE_FLAGS) {
      expect(typeof all[flag]).toBe('boolean')
    }
  })
})
