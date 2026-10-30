import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../../config/env.js'
import { ApiError } from '../../shared/utils/api-error.js'

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
const WINDOW_MS = 60_000

export async function transcriptionRateLimitGuard(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (!request.user) return

  const now = Date.now()
  const bucket = buckets.get(request.user.id)
  const maxRequests = env.TRANSCRIPTION_RPM

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(request.user.id, { count: 1, resetAt: now + WINDOW_MS })
    return
  }

  if (bucket.count >= maxRequests) {
    throw new ApiError(429, 'RATE_LIMIT_EXCEEDED', 'Too many transcription requests. Please wait and try again.', {
      windowMs: WINDOW_MS,
      maxRequests,
    })
  }

  bucket.count += 1
}

export function resetTranscriptionRateLimits(): void {
  buckets.clear()
}
