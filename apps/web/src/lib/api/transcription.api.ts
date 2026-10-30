import { ApiError, authenticatedFetch } from './client'

export interface TranscriptionResult {
  transcript: string
  metadata: {
    model: string
    mimeType: string
    sizeBytes: number
    language?: string
    durationSeconds?: number
  }
}

export async function transcribeExplanation(input: {
  audio: Blob
  filename: string
  topic?: string
  durationSeconds?: number
}): Promise<TranscriptionResult> {
  const formData = new FormData()
  formData.append('audioFile', input.audio, input.filename)

  const topic = input.topic?.replace(/\s+/g, ' ').trim().slice(0, 80)
  if (topic) formData.append('topic', topic)
  if (input.durationSeconds != null) {
    formData.append('durationSeconds', String(Math.max(1, Math.round(input.durationSeconds))))
  }

  let response: Response
  try {
    response = await authenticatedFetch('/transcription', {
      method: 'POST',
      body: formData,
    })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, 'NETWORK_ERROR', 'The network connection was interrupted. Try again.')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    let message =
      typeof data?.error?.message === 'string' ? data.error.message : 'Transcription failed'
    let code = typeof data?.error?.code === 'string' ? data.error.code : 'API_ERROR'

    if (response.status === 404) {
      message =
        'Transcription API is not available. Restart the backend (npm run dev:api) and try again.'
      code = 'TRANSCRIPTION_ROUTE_MISSING'
    }

    throw new ApiError(response.status, code, message)
  }

  if (typeof data?.transcript !== 'string' || !data.transcript.trim()) {
    throw new ApiError(502, 'UNEXPECTED_PROVIDER_RESPONSE', 'Transcription returned an empty response.')
  }

  return data as TranscriptionResult
}
