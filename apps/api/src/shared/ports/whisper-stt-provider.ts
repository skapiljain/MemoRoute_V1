import { env } from '../../config/env.js'
import { audioExtensionForMime, normalizeAudioMime } from '../utils/audio-format.js'

import type { STTProvider } from './stt-provider.js'

export type SttErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'bad_audio'
  | 'upstream'
  | 'timeout'
  | 'empty'
  | 'not_configured'

export class SttError extends Error {
  readonly kind: SttErrorKind
  readonly status?: number

  constructor(kind: SttErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'SttError'
    this.kind = kind
    this.status = status
  }
}

const RETRY_DELAY_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

export class WhisperSTTProvider implements STTProvider {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl || 'https://api.openai.com/v1'
  }

  async transcribe(buffer: Buffer, mimeType: string): Promise<string> {
    const normalized = normalizeAudioMime(mimeType)
    const extension = audioExtensionForMime(mimeType)

    const doRequest = async (): Promise<Response> => {
      const formData = new FormData()
      formData.append(
        'file',
        new Blob([buffer], { type: normalized }),
        `explanation.${extension}`,
      )
      formData.append('model', env.WHISPER_MODEL)
      formData.append('response_format', 'json')
      if (env.STT_LANGUAGE) {
        formData.append('language', env.STT_LANGUAGE)
      }

      return fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(env.STT_TIMEOUT_MS),
      })
    }

    let response: Response
    try {
      response = await doRequest()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new SttError('timeout', 'Speech-to-text request timed out')
      }
      // Network error — retry once
      try {
        await sleep(RETRY_DELAY_MS)
        response = await doRequest()
      } catch (retryError) {
        if (retryError instanceof DOMException && retryError.name === 'TimeoutError') {
          throw new SttError('timeout', 'Speech-to-text request timed out')
        }
        throw new SttError('upstream', 'Speech-to-text service is unreachable')
      }
    }

    if (!response.ok) {
      const status = response.status
      let errText: string
      try {
        errText = await response.text()
      } catch {
        errText = ''
      }

      // Log server-side only — never expose to client
      console.error(`[WhisperSTT] Error ${status}: ${errText}`)

      // Do NOT retry 400/401/403
      if (status === 401 || status === 403) {
        throw new SttError('auth', 'Speech-to-text authentication failed', status)
      }
      if (status === 400 || status === 413 || status === 415) {
        throw new SttError('bad_audio', 'The audio could not be processed', status)
      }

      // Retryable: 429 or 5xx
      if (isRetryable(status)) {
        try {
          await sleep(RETRY_DELAY_MS)
          const retryResponse = await doRequest()

          if (!retryResponse.ok) {
            const retryStatus = retryResponse.status
            let retryErrText: string
            try {
              retryErrText = await retryResponse.text()
            } catch {
              retryErrText = ''
            }
            console.error(`[WhisperSTT] Retry error ${retryStatus}: ${retryErrText}`)

            if (retryStatus === 401 || retryStatus === 403) {
              throw new SttError('auth', 'Speech-to-text authentication failed', retryStatus)
            }
            if (retryStatus === 400 || retryStatus === 413 || retryStatus === 415) {
              throw new SttError('bad_audio', 'The audio could not be processed', retryStatus)
            }
            if (retryStatus === 429) {
              throw new SttError('rate_limit', 'Speech-to-text rate limit exceeded', retryStatus)
            }
            throw new SttError('upstream', 'Speech-to-text service error', retryStatus)
          }

          response = retryResponse
        } catch (retryError) {
          if (retryError instanceof SttError) throw retryError
          if (retryError instanceof DOMException && retryError.name === 'TimeoutError') {
            throw new SttError('timeout', 'Speech-to-text request timed out')
          }
          throw new SttError('upstream', 'Speech-to-text service is unreachable')
        }
      } else {
        throw new SttError('upstream', 'Speech-to-text service error', status)
      }
    }

    const data = (await response.json()) as { text?: string }
    const text = data.text?.trim()

    if (!text) {
      throw new SttError('empty', 'Whisper STT returned an empty transcript')
    }

    return text
  }
}

export function createWhisperProvider(): WhisperSTTProvider {
  const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new SttError('not_configured', 'OPENAI_API_KEY is required for Whisper STT')
  }
  return new WhisperSTTProvider(apiKey, env.OPENAI_BASE_URL)
}
