import { createHash } from 'node:crypto'
import { env } from './env.js'

export type FeatureFlag =
  | 'TRANSCRIPT_CONFIRM'
  | 'CHUNKED_RAG'
  | 'GROUNDED_EVALUATOR'
  | 'CONCEPT_RETENTION'
  | 'ASYNC_PIPELINE'

export const FEATURE_FLAGS: readonly FeatureFlag[] = [
  'TRANSCRIPT_CONFIRM',
  'CHUNKED_RAG',
  'GROUNDED_EVALUATOR',
  'CONCEPT_RETENTION',
  'ASYNC_PIPELINE',
] as const

export function hashUserForFlag(userId: string, flag: FeatureFlag | string): number {
  const hash = createHash('sha256').update(`${userId}:${flag}`).digest('hex')
  return parseInt(hash.slice(0, 8), 16) % 100
}

export function isFlagEnabled(flag: FeatureFlag, userId?: string): boolean {
  const envKey = `FLAG_${flag}` as keyof typeof env
  const percentKey = `FLAG_${flag}_PERCENT` as keyof typeof env

  if (Boolean(env[envKey])) {
    return true
  }

  const percent = Number(env[percentKey]) || 0
  if (percent <= 0) {
    return false
  }

  if (percent >= 100) {
    return true
  }

  if (!userId) {
    return false
  }

  const bucket = hashUserForFlag(userId, flag)
  return bucket < percent
}

export function getAllFlags(userId?: string): Record<FeatureFlag, boolean> {
  const result = {} as Record<FeatureFlag, boolean>
  for (const flag of FEATURE_FLAGS) {
    result[flag] = isFlagEnabled(flag, userId)
  }
  return result
}
