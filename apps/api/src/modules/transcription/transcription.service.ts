import { createHash } from 'node:crypto'
import { env } from '../../config/env.js'
import { AudioValidationError, validateAudioFile, type ValidatedAudioFile } from '../../shared/audio/audio-file.js'
import { createGroqSttProvider, SttProviderError } from '../../shared/ports/groq-stt-provider.js'
import { ApiError } from '../../shared/utils/api-error.js'
import type { TranscriptionFields, TranscriptionResponse } from './transcription.schemas.js'

interface CacheEntry {
  expiresAt: number
  result: TranscriptionResponse
}

const resultCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<TranscriptionResponse>>()
const CACHE_TTL_MS = 2 * 60_000

export interface TranscribeAudioInput {
  userId: string
  audio: Buffer
  declaredMimeType: string
  language?: string
  topic?: string
  durationSeconds?: number
}

/**
 * Turns one audio recording into a transcript.
 * This is the STT boundary: callers receive text and do their own evaluation.
 */
export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscriptionResponse> {
  let audio: ValidatedAudioFile
  try {
    audio = validateAudioFile(input.audio, input.declaredMimeType, env.GROQ_STT_MAX_BYTES)
  } catch (error) {
    if (error instanceof AudioValidationError) {
      const status = error.code === 'FILE_TOO_LARGE' ? 413 : 400
      throw new ApiError(status, error.code, error.message)
    }
    throw error
  }

  if (
    input.durationSeconds != null &&
    input.durationSeconds > env.GROQ_STT_MAX_DURATION_SECONDS
  ) {
    throw new ApiError(
      400,
      'AUDIO_TOO_LONG',
      `Recordings must be ${env.GROQ_STT_MAX_DURATION_SECONDS} seconds or shorter.`,
    )
  }

  const fields = sanitizeFields({ language: input.language, topic: input.topic })
  const cacheKey = [
    input.userId,
    createHash('sha256').update(input.audio).digest('hex'),
    fields.language ?? '',
    fields.topic ?? '',
  ].join(':')

  const cached = resultCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result
  }

  const pending = inFlight.get(cacheKey)
  if (pending) return pending

  const request = completeTranscription(input.audio, audio, fields)
    .then((result) => {
      resultCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, result })
      return result
    })
    .finally(() => {
      inFlight.delete(cacheKey)
    })

  inFlight.set(cacheKey, request)
  return request
}

async function completeTranscription(
  audioBuffer: Buffer,
  audio: ValidatedAudioFile,
  fields: TranscriptionFields,
): Promise<TranscriptionResponse> {
  let provider
  try {
    if (!env.GROQ_API_KEY?.trim()) {
      throw new ApiError(
        503,
        'TRANSCRIPTION_NOT_CONFIGURED',
        'Speech-to-text is not configured on the server. Set GROQ_API_KEY in apps/api/.env and restart the API.',
      )
    }
    provider = createGroqSttProvider()
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof SttProviderError) {
      throw new ApiError(503, 'TRANSCRIPTION_UNAVAILABLE', 'Transcription is temporarily unavailable.')
    }
    throw error
  }

  try {
    const detailed = await provider.transcribeDetailed({
      audio: audioBuffer,
      mimeType: audio.mimeType,
      filename: `explanation.${audio.extension}`,
      language: fields.language,
      topic: fields.topic,
    })

    return {
      transcript: detailed.text,
      metadata: {
        model: detailed.metadata.model,
        mimeType: audio.mimeType,
        sizeBytes: audio.sizeBytes,
        ...(detailed.metadata.language ? { language: detailed.metadata.language } : {}),
        ...(detailed.metadata.durationSeconds != null
          ? { durationSeconds: detailed.metadata.durationSeconds }
          : {}),
      },
    }
  } catch (error) {
    if (error instanceof SttProviderError) {
      throw toApiError(error)
    }
    throw new ApiError(502, 'TRANSCRIPTION_FAILED', 'Transcription failed. Please try again.')
  }
}

function sanitizeFields(fields: TranscriptionFields): TranscriptionFields {
  return {
    ...(fields.language ? { language: fields.language } : {}),
    ...(fields.topic ? { topic: fields.topic.replace(/[\r\n]+/g, ' ').trim().slice(0, 80) } : {}),
  }
}

function toApiError(error: SttProviderError): ApiError {
  switch (error.code) {
    case 'SILENT':
      return new ApiError(422, 'SILENT_AUDIO', error.message)
    case 'RATE_LIMIT':
      return new ApiError(429, 'RATE_LIMIT_EXCEEDED', error.message, {
        ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      })
    case 'TIMEOUT':
      return new ApiError(504, 'TRANSCRIPTION_TIMEOUT', error.message)
    case 'PROVIDER_AUTH':
    case 'UNAVAILABLE':
      return new ApiError(503, 'TRANSCRIPTION_UNAVAILABLE', error.message)
    case 'UNEXPECTED':
      return new ApiError(502, 'UNEXPECTED_PROVIDER_RESPONSE', error.message)
    default:
      return new ApiError(400, 'TRANSCRIPTION_REJECTED', error.message)
  }
}

export function resetTranscriptionCache(): void {
  resultCache.clear()
  inFlight.clear()
}
