import { describe, expect, it } from 'vitest'
import { AudioValidationError, validateAudioFile } from '../src/shared/audio/audio-file.js'
import { GroqSttProvider, normalizeTranscript, SttProviderError } from '../src/shared/ports/groq-stt-provider.js'

function webm(bytes = 64): Buffer {
  return Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(Math.max(0, bytes - 4), 7)])
}

describe('audio file validation', () => {
  it('accepts webm when the declared type matches the header', () => {
    expect(validateAudioFile(webm(), 'audio/webm;codecs=opus')).toMatchObject({
      mimeType: 'audio/webm',
      extension: 'webm',
    })
  })

  it('rejects empty, oversized, and invalid uploads', () => {
    expect(() => validateAudioFile(Buffer.from([0x1a, 0x45]), 'audio/webm')).toThrow(AudioValidationError)

    try {
      validateAudioFile(webm(80), 'audio/webm', 40)
      throw new Error('expected size rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(AudioValidationError)
      expect((error as AudioValidationError).code).toBe('FILE_TOO_LARGE')
    }

    try {
      validateAudioFile(Buffer.alloc(80, 1), 'audio/webm')
      throw new Error('expected content rejection')
    } catch (error) {
      expect((error as AudioValidationError).code).toBe('INVALID_AUDIO')
    }

    try {
      validateAudioFile(webm(), 'text/plain')
      throw new Error('expected mime rejection')
    } catch (error) {
      expect((error as AudioValidationError).code).toBe('UNSUPPORTED_AUDIO')
    }
  })
})

describe('Groq speech provider', () => {
  it('keeps spoken words while normalizing whitespace', () => {
    expect(normalizeTranscript('  Um,  the   left\r\n\r\n\r\n subtree   ')).toBe('Um, the left\n\n subtree')
  })

  it('sends the configured model and returns the transcript', async () => {
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = init?.body as FormData
      expect(body.get('model')).toBe('whisper-large-v3')
      expect(body.get('language')).toBe('en')
      expect(String(body.get('prompt'))).toContain('binary search tree')
      expect(String(body.get('prompt'))).toContain('Topic: Binary search trees.')
      return new Response(
        JSON.stringify({
          text: 'A binary search tree keeps smaller values on the left.',
          language: 'en',
          duration: 6.5,
          segments: [{ text: 'A binary search tree keeps smaller values on the left.', no_speech_prob: 0.02 }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    const provider = new GroqSttProvider({
      apiKey: 'test-key',
      model: 'whisper-large-v3',
      baseUrl: 'https://api.groq.com/openai/v1',
      timeoutMs: 5_000,
      defaultLanguage: 'en',
      fetchImpl: fetchImpl as typeof fetch,
    })

    const result = await provider.transcribeDetailed({
      audio: webm(),
      mimeType: 'audio/webm',
      filename: 'explanation.webm',
      topic: 'Binary search trees',
    })

    expect(result.text).toContain('smaller values on the left')
    expect(result.metadata.model).toBe('whisper-large-v3')
    expect(result.metadata.durationSeconds).toBe(6.5)
  })

  it('hides provider secrets and maps silent audio and auth failures', async () => {
    const silentProvider = new GroqSttProvider({
      apiKey: 'gsk_should_not_leak',
      model: 'whisper-large-v3-turbo',
      baseUrl: 'https://api.groq.com/openai/v1',
      timeoutMs: 5_000,
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({ text: '', duration: 2, segments: [{ no_speech_prob: 0.99, text: '' }] }),
          { status: 200 },
        )) as typeof fetch,
    })

    await expect(
      silentProvider.transcribeDetailed({ audio: webm(), mimeType: 'audio/webm', filename: 'explanation.webm' }),
    ).rejects.toMatchObject({ code: 'SILENT' })

    const authProvider = new GroqSttProvider({
      apiKey: 'gsk_should_not_leak',
      model: 'whisper-large-v3-turbo',
      baseUrl: 'https://api.groq.com/openai/v1',
      timeoutMs: 5_000,
      fetchImpl: (async () => new Response('bad key gsk_should_not_leak', { status: 401 })) as typeof fetch,
    })

    try {
      await authProvider.transcribeDetailed({
        audio: webm(),
        mimeType: 'audio/webm',
        filename: 'explanation.webm',
      })
      throw new Error('expected auth failure')
    } catch (error) {
      expect(error).toBeInstanceOf(SttProviderError)
      expect((error as Error).message).not.toContain('gsk_')
      expect((error as SttProviderError).code).toBe('PROVIDER_AUTH')
    }
  })
})
