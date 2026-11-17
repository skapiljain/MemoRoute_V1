import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { env } from '../src/config/env.js'
import { createWhisperProvider, SttError, WhisperSTTProvider } from '../src/shared/ports/whisper-stt-provider.js'
import { ApiError } from '../src/shared/utils/api-error.js'

function audioBuffer(): Buffer {
  return Buffer.alloc(128, 0xab)
}

describe('WhisperSTTProvider with local HTTP server (real fetch)', () => {
  let server: http.Server
  let serverUrl: string
  let requestHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (requestHandler) {
        requestHandler(req, res)
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })

    const port = (server.address() as AddressInfo).port
    serverUrl = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  })

  beforeEach(() => {
    env.STT_TIMEOUT_MS = 10_000
    env.WHISPER_MODEL = 'whisper-1'
    env.STT_LANGUAGE = undefined
  })

  it('sends correct URL, Authorization header, model, and file on success', async () => {
    let capturedAuth = ''
    let capturedBody = ''

    requestHandler = (req, res) => {
      capturedAuth = req.headers.authorization ?? ''
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        capturedBody = Buffer.concat(chunks).toString('utf8')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ text: 'Hello world from Whisper' }))
      })
    }

    const provider = new WhisperSTTProvider('test-whisper-key', serverUrl)
    const result = await provider.transcribe(audioBuffer(), 'audio/webm')

    expect(result).toBe('Hello world from Whisper')
    expect(capturedAuth).toBe('Bearer test-whisper-key')
    expect(capturedBody).toContain('name="model"\r\n\r\nwhisper-1')
    expect(capturedBody).toContain('filename="explanation.webm"')
    expect(capturedBody).toContain('Content-Type: audio/webm')
  })

  it('maps each mime type to the right file extension and blob type', async () => {
    const cases: Array<[string, string, string]> = [
      ['audio/webm', 'explanation.webm', 'audio/webm'],
      ['audio/webm;codecs=opus', 'explanation.webm', 'audio/webm'],
      ['audio/wav', 'explanation.wav', 'audio/wav'],
      ['audio/x-wav', 'explanation.wav', 'audio/x-wav'],
      ['audio/mp4', 'explanation.mp4', 'audio/mp4'],
      ['audio/ogg', 'explanation.ogg', 'audio/ogg'],
      ['audio/ogg;codecs=opus', 'explanation.ogg', 'audio/ogg'],
      ['audio/mpeg', 'explanation.mp3', 'audio/mpeg'],
      ['audio/mp3', 'explanation.mp3', 'audio/mp3'],
      ['audio/m4a', 'explanation.m4a', 'audio/m4a'],
      ['audio/x-m4a', 'explanation.m4a', 'audio/x-m4a'],
    ]

    for (const [mime, expectedName, expectedType] of cases) {
      let bodyText = ''
      requestHandler = (req, res) => {
        const chunks: Buffer[] = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
          bodyText = Buffer.concat(chunks).toString('utf8')
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ text: 'ok' }))
        })
      }

      const provider = new WhisperSTTProvider('test-whisper-key', serverUrl)
      const res = await provider.transcribe(audioBuffer(), mime)
      expect(res).toBe('ok')
      expect(bodyText).toContain(`filename="${expectedName}"`)
      expect(bodyText).toContain(`Content-Type: ${expectedType}`)
    }
  })

  it('trims whitespace from the returned text', async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ text: '  trimmed text  ' }))
    }

    const provider = new WhisperSTTProvider('test-whisper-key', serverUrl)
    const result = await provider.transcribe(audioBuffer(), 'audio/webm')
    expect(result).toBe('trimmed text')
  })

  it('throws SttError with kind "empty" for empty transcript', async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ text: '    ' }))
    }

    const provider = new WhisperSTTProvider('test-whisper-key', serverUrl)
    await expect(provider.transcribe(audioBuffer(), 'audio/webm')).rejects.toMatchObject({
      kind: 'empty',
    })
  })

  it('throws SttError with kind "auth" for 401 without leaking API key', async () => {
    requestHandler = (_req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'Invalid API key: secret-key-do-not-leak' } }))
    }

    const provider = new WhisperSTTProvider('secret-key-do-not-leak', serverUrl)
    try {
      await provider.transcribe(audioBuffer(), 'audio/webm')
      throw new Error('expected to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(SttError)
      const sttErr = err as SttError
      expect(sttErr.kind).toBe('auth')
      expect(sttErr.message).not.toContain('secret-key-do-not-leak')
    }
  })

  it('retries once on 429 then succeeds', async () => {
    let attempts = 0
    requestHandler = (_req, res) => {
      attempts++
      if (attempts === 1) {
        res.writeHead(429, { 'Content-Type': 'text/plain' })
        res.end('Rate limit exceeded')
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ text: 'success after retry' }))
      }
    }

    const provider = new WhisperSTTProvider('test-whisper-key', serverUrl)
    const result = await provider.transcribe(audioBuffer(), 'audio/webm')
    expect(result).toBe('success after retry')
    expect(attempts).toBe(2)
  })

  it('throws SttError with kind "bad_audio" for 400 responses without retry', async () => {
    let attempts = 0
    requestHandler = (_req, res) => {
      attempts++
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'Corrupt audio file' } }))
    }

    const provider = new WhisperSTTProvider('test-whisper-key', serverUrl)
    await expect(provider.transcribe(audioBuffer(), 'audio/webm')).rejects.toMatchObject({
      kind: 'bad_audio',
    })
    expect(attempts).toBe(1)
  })

  it('retries once on 500 then throws upstream if second attempt fails', async () => {
    let attempts = 0
    requestHandler = (_req, res) => {
      attempts++
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal Server Error')
    }

    const provider = new WhisperSTTProvider('test-whisper-key', serverUrl)
    await expect(provider.transcribe(audioBuffer(), 'audio/webm')).rejects.toMatchObject({
      kind: 'upstream',
    })
    expect(attempts).toBe(2)
  })

  it('throws SttError with kind "timeout" when request exceeds timeout', async () => {
    env.STT_TIMEOUT_MS = 200

    requestHandler = () => {
      // Intentionally do not respond, let client timeout
    }

    const provider = new WhisperSTTProvider('test-whisper-key', serverUrl)
    await expect(provider.transcribe(audioBuffer(), 'audio/webm')).rejects.toMatchObject({
      kind: 'timeout',
    })
  })

  it('throws ApiError 415 for unsupported mime type', async () => {
    const provider = new WhisperSTTProvider('test-whisper-key', serverUrl)
    await expect(provider.transcribe(audioBuffer(), 'application/json')).rejects.toBeInstanceOf(ApiError)
  })

  it('includes language field when STT_LANGUAGE is configured', async () => {
    env.STT_LANGUAGE = 'es'
    let capturedBody = ''

    requestHandler = (req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        capturedBody = Buffer.concat(chunks).toString('utf8')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ text: 'hola mundo' }))
      })
    }

    const provider = new WhisperSTTProvider('test-whisper-key', serverUrl)
    const result = await provider.transcribe(audioBuffer(), 'audio/webm')
    expect(result).toBe('hola mundo')
    expect(capturedBody).toContain('name="language"\r\n\r\nes')
  })

  it('throws SttError with kind "not_configured" when OPENAI_API_KEY is missing', () => {
    const origKey = env.OPENAI_API_KEY
    const origEnvKey = process.env.OPENAI_API_KEY

    delete (env as Record<string, unknown>).OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY

    try {
      expect(() => createWhisperProvider()).toThrowError(SttError)
      try {
        createWhisperProvider()
      } catch (err) {
        expect((err as SttError).kind).toBe('not_configured')
      }
    } finally {
      env.OPENAI_API_KEY = origKey
      if (origEnvKey) process.env.OPENAI_API_KEY = origEnvKey
    }
  })
})
