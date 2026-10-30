import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { resetTranscriptionRateLimits } from '../src/modules/transcription/transcription-rate-limit.js'
import { resetTranscriptionCache } from '../src/modules/transcription/transcription.service.js'
import { registerTestUser } from './helpers/auth.js'

function webm(): Buffer {
  return Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(96, 4)])
}

function multipart(parts: Array<{ name: string; value: string | Buffer; filename?: string; type?: string }>): {
  body: Buffer
  contentType: string
} {
  const boundary = '----mindEchoBoundary'
  const chunks: Buffer[] = []

  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`))
    if (Buffer.isBuffer(part.value)) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename ?? 'explanation.webm'}"\r\nContent-Type: ${part.type ?? 'audio/webm'}\r\n\r\n`,
        ),
      )
      chunks.push(part.value)
      chunks.push(Buffer.from('\r\n'))
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`))
    }
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` }
}

describe('Transcription API', () => {
  let app: FastifyInstance
  const originalFetch = globalThis.fetch

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetTranscriptionCache()
    resetTranscriptionRateLimits()
  })

  it('rejects unauthenticated uploads', async () => {
    const payload = multipart([{ name: 'audioFile', value: webm() }])
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/transcription',
      headers: { 'content-type': payload.contentType },
      payload: payload.body,
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('UNAUTHORIZED')
  })

  it('returns a transcript and does not call the provider twice for the same audio', async () => {
    const session = await registerTestUser(app, { email: 'stt-success@test.com' })
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          text: 'Hash tables map keys to buckets.',
          language: 'english',
          duration: 3.2,
          segments: [{ text: 'Hash tables map keys to buckets.', no_speech_prob: 0.01 }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    globalThis.fetch = fetchMock as typeof fetch

    const payload = multipart([
      { name: 'topic', value: 'Hash tables' },
      { name: 'durationSeconds', value: '4' },
      { name: 'audioFile', value: webm() },
    ])

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/transcription',
      headers: { authorization: `Bearer ${session.token}`, 'content-type': payload.contentType },
      payload: payload.body,
    })

    expect(first.statusCode).toBe(200)
    expect(first.json().transcript).toBe('Hash tables map keys to buckets.')
    expect(first.json().metadata.model).toBe('whisper-large-v3-turbo')
    expect(JSON.stringify(first.json())).not.toContain('test-groq-key')

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/transcription',
      headers: { authorization: `Bearer ${session.token}`, 'content-type': payload.contentType },
      payload: payload.body,
    })

    expect(second.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid files, silent audio, provider failures, and overlong recordings', async () => {
    const session = await registerTestUser(app, { email: 'stt-errors@test.com' })

    const invalid = multipart([{ name: 'audioFile', value: Buffer.from('this is plain text, not audio data!!'), type: 'audio/webm' }])
    const invalidResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/transcription',
      headers: { authorization: `Bearer ${session.token}`, 'content-type': invalid.contentType },
      payload: invalid.body,
    })
    expect(invalidResponse.statusCode).toBe(400)
    expect(invalidResponse.json().error.code).toBe('INVALID_AUDIO')

    globalThis.fetch = vi.fn(async () => new Response('upstream exploded gsk_secret', { status: 500 })) as typeof fetch
    const providerDown = multipart([{ name: 'audioFile', value: webm() }])
    const providerResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/transcription',
      headers: { authorization: `Bearer ${session.token}`, 'content-type': providerDown.contentType },
      payload: providerDown.body,
    })
    expect(providerResponse.statusCode).toBe(503)
    expect(providerResponse.body).not.toContain('gsk_')
    expect(providerResponse.body).not.toContain('exploded')

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ text: 'uh', duration: 1, segments: [{ no_speech_prob: 0.96 }] }), { status: 200 }),
    ) as typeof fetch
    const silent = multipart([{ name: 'audioFile', value: Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(80, 9)]) }])
    const silentResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/transcription',
      headers: { authorization: `Bearer ${session.token}`, 'content-type': silent.contentType },
      payload: silent.body,
    })
    expect(silentResponse.statusCode).toBe(422)
    expect(silentResponse.json().error.code).toBe('SILENT_AUDIO')

    const tooLong = multipart([
      { name: 'durationSeconds', value: '9999' },
      { name: 'audioFile', value: webm() },
    ])
    const tooLongResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/transcription',
      headers: { authorization: `Bearer ${session.token}`, 'content-type': tooLong.contentType },
      payload: tooLong.body,
    })
    expect(tooLongResponse.statusCode).toBe(400)
    expect(tooLongResponse.json().error.code).toBe('AUDIO_TOO_LONG')
  })
})
