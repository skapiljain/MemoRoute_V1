import { env } from '../../config/env.js'
import type { STTProvider } from './stt-provider.js'

const SUPPORTED_MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'] as const

export type GroqSttModel = (typeof SUPPORTED_MODELS)[number]

export interface TranscriptionMetadata {
  model: string
  language?: string
  durationSeconds?: number
}

export interface DetailedTranscript {
  text: string
  metadata: TranscriptionMetadata
}

export class SttProviderError extends Error {
  readonly code:
    | 'PROVIDER_AUTH'
    | 'RATE_LIMIT'
    | 'TIMEOUT'
    | 'UNAVAILABLE'
    | 'REJECTED'
    | 'UNEXPECTED'
    | 'SILENT'

  readonly retryAfterSeconds?: number

  constructor(code: SttProviderError['code'], message: string, retryAfterSeconds?: number) {
    super(message)
    this.name = 'SttProviderError'
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export interface GroqSttOptions {
  apiKey: string
  model: string
  baseUrl: string
  timeoutMs: number
  defaultLanguage?: string
  fetchImpl?: typeof fetch
}

interface VerboseSegment {
  text?: string
  no_speech_prob?: number
}

interface VerboseTranscription {
  text?: string
  language?: string
  duration?: number
  segments?: VerboseSegment[]
}

const VOCABULARY_PROMPT =
  'Verbatim student explanation in English, including Indian English. Keep filler words such as um and uh. Do not summarize or correct the meaning. Technical spellings: algorithm, recursion, binary search tree, hash table, photosynthesis, mitochondria, nucleotide, derivative, integral, polynomial, voltage, capacitor.'

export class GroqSttProvider implements STTProvider {
  private readonly apiKey: string
  private readonly model: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly defaultLanguage?: string
  private readonly fetchImpl: typeof fetch

  constructor(options: GroqSttOptions) {
    this.apiKey = options.apiKey
    this.model = options.model
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.timeoutMs = options.timeoutMs
    this.defaultLanguage = options.defaultLanguage
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const result = await this.transcribeDetailed({
      audio: audioBuffer,
      mimeType,
      filename: `explanation.${extensionForMime(mimeType)}`,
    })
    return result.text
  }

  async transcribeDetailed(input: {
    audio: Buffer
    mimeType: string
    filename: string
    language?: string
    topic?: string
  }): Promise<DetailedTranscript> {
    const formData = new FormData()
    formData.append(
      'file',
      new Blob([new Uint8Array(input.audio)], { type: input.mimeType }),
      input.filename,
    )
    formData.append('model', this.model)
    formData.append('response_format', 'verbose_json')
    formData.append('temperature', '0')
    formData.append('prompt', buildPrompt(input.topic))

    const language = normalizeLanguage(input.language) ?? normalizeLanguage(this.defaultLanguage)
    if (language) {
      formData.append('language', language)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: formData,
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new SttProviderError('TIMEOUT', 'Transcription timed out. Please try again.')
      }
      throw new SttProviderError('UNAVAILABLE', 'The transcription service could not be reached.')
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      throw mapProviderFailure(response.status, response.headers.get('retry-after'))
    }

    const payload = (await response.json().catch(() => null)) as VerboseTranscription | null
    if (!payload || typeof payload.text !== 'string') {
      throw new SttProviderError('UNEXPECTED', 'The transcription service returned an unexpected response.')
    }

    const text = normalizeTranscript(payload.text)
    if (!text || isLikelySilence(payload, text)) {
      throw new SttProviderError(
        'SILENT',
        'No speech was detected in the recording. Speak closer to the microphone and try again.',
      )
    }

    return {
      text,
      metadata: {
        model: this.model,
        ...(payload.language ? { language: payload.language } : {}),
        ...(typeof payload.duration === 'number' ? { durationSeconds: payload.duration } : {}),
      },
    }
  }
}

export function createGroqSttProvider(fetchImpl?: typeof fetch): GroqSttProvider {
  const apiKey = env.GROQ_API_KEY
  if (!apiKey) {
    throw new SttProviderError('PROVIDER_AUTH', 'Transcription is not configured.')
  }

  return new GroqSttProvider({
    apiKey,
    model: env.GROQ_STT_MODEL,
    baseUrl: env.GROQ_STT_BASE_URL,
    timeoutMs: env.GROQ_STT_TIMEOUT_MS,
    defaultLanguage: env.GROQ_STT_LANGUAGE || undefined,
    fetchImpl,
  })
}

export function isSupportedGroqModel(model: string): model is GroqSttModel {
  return (SUPPORTED_MODELS as readonly string[]).includes(model)
}

function buildPrompt(topic?: string): string {
  const cleaned = topic?.replace(/\s+/g, ' ').trim()
  if (!cleaned) return VOCABULARY_PROMPT
  const safeTopic = cleaned.slice(0, 80)
  return `${VOCABULARY_PROMPT} Topic: ${safeTopic}.`
}

function normalizeLanguage(language?: string): string | undefined {
  if (!language) return undefined
  const value = language.trim().toLowerCase()
  if (value === 'auto') return undefined
  return /^[a-z]{2}$/.test(value) ? value : undefined
}

export function normalizeTranscript(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function isLikelySilence(payload: VerboseTranscription, text: string): boolean {
  const segments = payload.segments ?? []
  if (segments.length === 0) return false

  const probabilities = segments
    .map((segment) => segment.no_speech_prob)
    .filter((value): value is number => typeof value === 'number')

  if (probabilities.length === 0) return false

  const average = probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length
  const wordCount = text.split(/\s+/).filter(Boolean).length
  return average >= 0.85 && wordCount <= 2
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
  if (mimeType.includes('ogg') || mimeType.includes('opus')) return 'ogg'
  if (mimeType.includes('flac')) return 'flac'
  return 'webm'
}

function mapProviderFailure(status: number, retryAfter: string | null): SttProviderError {
  const retryAfterSeconds = retryAfter ? Number.parseInt(retryAfter, 10) : undefined
  const retry = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined

  if (status === 401 || status === 403) {
    return new SttProviderError('PROVIDER_AUTH', 'Transcription is temporarily unavailable.')
  }

  if (status === 429) {
    return new SttProviderError('RATE_LIMIT', 'The transcription service is busy. Please wait and try again.', retry)
  }

  if (status === 413) {
    return new SttProviderError('REJECTED', 'The recording is too large to transcribe.')
  }

  if (status >= 500) {
    return new SttProviderError('UNAVAILABLE', 'The transcription service is temporarily unavailable.')
  }

  return new SttProviderError('REJECTED', 'The recording could not be transcribed. Try recording again.')
}
