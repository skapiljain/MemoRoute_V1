import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Evaluation } from '../src/models/Evaluation.js'
import { Note } from '../src/models/Note.js'
import { PipelineRun } from '../src/models/PipelineRun.js'
import { UsageRecord } from '../src/models/UsageRecord.js'
import { buildApp } from '../src/app.js'
import {
  deleteAudioFile,
  getAudioStorage,
  resetAudioStorage,
} from '../src/shared/storage/audio-storage.js'
import { SttError } from '../src/shared/ports/whisper-stt-provider.js'
import * as ports from '../src/shared/ports/index.js'
import {
  audioExtensionForMime,
  normalizeAudioMime,
} from '../src/shared/utils/audio-format.js'
import { fromPublicEvalId } from '../src/shared/utils/eval-id.js'
import { fromPublicNoteId } from '../src/shared/utils/note-id.js'
import { fromPublicUserId } from '../src/shared/utils/user-id.js'
import { registerTestUser, type TestAuthSession } from './helpers/auth.js'
import { multipart } from './helpers/multipart.js'
import { createTestNote } from './helpers/notes.js'

async function upgradeToPro(app: FastifyInstance, session: TestAuthSession) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/subscriptions/checkout',
    headers: { authorization: `Bearer ${session.token}` },
    payload: {
      planId: 'pro',
      billingCycle: 'monthly',
      paymentToken: 'tok_mock_card_1234',
    },
  })
  expect(res.statusCode).toBe(200)
}

describe('Voice Evaluations API (Tasks 1, 2, 5, 6, 8)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    if (process.env.RUN_LIVE_TESTS !== 'true') {
      vi.spyOn(ports, 'createSTTProvider').mockReturnValue({
        transcribe: vi.fn(async () => 'This is a test transcript from audio recording.'),
      })
      vi.spyOn(ports, 'createLLMProvider').mockReturnValue({
        evaluateFeynman: vi.fn(async () => ({
          lectorScore: 85,
          correctness: 80,
          clarity: 90,
          completeness: 85,
          feedback: {
            strengths: ['Clear explanation'],
            missingConcepts: [],
            improvementTip: 'Keep practicing',
          },
          subConcepts: [{ name: 'Core concept', covered: true, score: 85 }],
          misconceptions: [],
          nextPrompt: 'Can you elaborate?',
          retentionImpact: { intervalDays: 3, reason: 'Good recall' },
        })),
      })
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetAudioStorage()
  })

  // Task 1 acceptance
  describe('Audio format utilities (Task 1)', () => {
    it('proves each mime maps to the right extension and mime-with-codecs works', () => {
      expect(normalizeAudioMime('AUDIO/WEBM; codecs=opus')).toBe('audio/webm')
      expect(normalizeAudioMime('audio/mp4;codecs=mp4a.40.2')).toBe('audio/mp4')

      expect(audioExtensionForMime('audio/webm')).toBe('webm')
      expect(audioExtensionForMime('audio/webm;codecs=opus')).toBe('webm')
      expect(audioExtensionForMime('audio/wav')).toBe('wav')
      expect(audioExtensionForMime('audio/x-wav')).toBe('wav')
      expect(audioExtensionForMime('audio/wave')).toBe('wav')
      expect(audioExtensionForMime('audio/mp4')).toBe('mp4')
      expect(audioExtensionForMime('audio/x-m4a')).toBe('m4a')
      expect(audioExtensionForMime('audio/m4a')).toBe('m4a')
      expect(audioExtensionForMime('audio/ogg')).toBe('ogg')
      expect(audioExtensionForMime('audio/ogg;codecs=opus')).toBe('ogg')
      expect(audioExtensionForMime('audio/mpeg')).toBe('mp3')
      expect(audioExtensionForMime('audio/mp3')).toBe('mp3')
    })

    it('returns 415 UNSUPPORTED_AUDIO_FORMAT for unsupported mime', () => {
      try {
        audioExtensionForMime('text/plain')
        throw new Error('expected error')
      } catch (error) {
        expect((error as { statusCode?: number }).statusCode).toBe(415)
        expect((error as { code?: string }).code).toBe('UNSUPPORTED_AUDIO_FORMAT')
      }
    })
  })

  // Task 8c requirements
  describe('Voice evaluation flows (Task 8c)', () => {
    it('voice upload returns 200 with a transcript for Pro plan', async () => {
      const session = await registerTestUser(app, { email: 'voice-pro-success@test.com' })
      await upgradeToPro(app, session)
      const note = await createTestNote(app, session)

      const payload = multipart([
        { name: 'noteId', value: note.id },
        {
          name: 'audioFile',
          value: Buffer.alloc(1024, 0x12),
          filename: 'explanation.webm',
          type: 'audio/webm',
        },
        { name: 'selfRating', value: '8' },
      ])

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/evaluations/feynman',
        headers: {
          authorization: `Bearer ${session.token}`,
          'content-type': payload.contentType,
        },
        payload: payload.body,
      })

      expect(response.statusCode).toBe(200)
      const data = response.json()
      expect(data.evaluationId).toMatch(/^eval_/)
      expect(data.transcript).toBeTruthy()
      expect(data.noteId).toBe(note.id)
      expect(data.lectorScore).toBeGreaterThan(0)

      // Ensure every evaluation has a PipelineRun
      const run = await PipelineRun.findOne({ refId: data.evaluationId })
      expect(run).toBeTruthy()
      expect(run?.status).toBe('succeeded')
      expect(run?.kind).toBe('evaluation')
      expect(run?.stages.length).toBeGreaterThan(0)
    })

    it('returns 403 VOICE_NOT_INCLUDED for Starter plan users', async () => {
      const session = await registerTestUser(app, { email: 'starter-voice@test.com' })
      const note = await createTestNote(app, session)

      const payload = multipart([
        { name: 'noteId', value: note.id },
        {
          name: 'audioFile',
          value: Buffer.alloc(1024, 0x12),
          filename: 'explanation.webm',
          type: 'audio/webm',
        },
      ])

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/evaluations/feynman',
        headers: {
          authorization: `Bearer ${session.token}`,
          'content-type': payload.contentType,
        },
        payload: payload.body,
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().error.code).toBe('VOICE_NOT_INCLUDED')
    })

    it('returns 400 when noteId is missing', async () => {
      const session = await registerTestUser(app, { email: 'missing-note@test.com' })
      await upgradeToPro(app, session)

      const payload = multipart([
        {
          name: 'audioFile',
          value: Buffer.alloc(512, 0x12),
          filename: 'explanation.webm',
          type: 'audio/webm',
        },
      ])

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/evaluations/feynman',
        headers: {
          authorization: `Bearer ${session.token}`,
          'content-type': payload.contentType,
        },
        payload: payload.body,
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 401 when no auth is provided', async () => {
      const payload = multipart([
        { name: 'noteId', value: 'note_123' },
        { name: 'audioFile', value: Buffer.alloc(512, 0x12) },
      ])

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/evaluations/feynman',
        headers: {
          'content-type': payload.contentType,
        },
        payload: payload.body,
      })

      expect(response.statusCode).toBe(401)
      expect(response.json().error.code).toBe('UNAUTHORIZED')
    })

    it('returns 413 when file is over 10 MB', async () => {
      const session = await registerTestUser(app, { email: 'large-audio@test.com' })
      await upgradeToPro(app, session)
      const note = await createTestNote(app, session)

      // Fastify multipart limit is 10 MB
      const oversized = Buffer.alloc(10 * 1024 * 1024 + 1024, 0xaa)
      const payload = multipart([
        { name: 'noteId', value: note.id },
        { name: 'audioFile', value: oversized, filename: 'explanation.webm', type: 'audio/webm' },
      ])

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/evaluations/feynman',
        headers: {
          authorization: `Bearer ${session.token}`,
          'content-type': payload.contentType,
        },
        payload: payload.body,
      })

      expect(response.statusCode).toBe(413)
    })

    it('returns 400 for audio with no text and no file', async () => {
      const session = await registerTestUser(app, { email: 'empty-eval@test.com' })
      await upgradeToPro(app, session)
      const note = await createTestNote(app, session)

      const payload = multipart([
        { name: 'noteId', value: note.id },
      ])

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/evaluations/feynman',
        headers: {
          authorization: `Bearer ${session.token}`,
          'content-type': payload.contentType,
        },
        payload: payload.body,
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error.code).toBe('EXPLANATION_REQUIRED')
    })

    it('GET /:id/audio returns the bytes with the right Content-Type', async () => {
      const session = await registerTestUser(app, { email: 'audio-bytes@test.com' })
      await upgradeToPro(app, session)
      const note = await createTestNote(app, session)

      const testAudioBytes = Buffer.from('RIFF1234WAVEfmt ')
      const payload = multipart([
        { name: 'noteId', value: note.id },
        {
          name: 'audioFile',
          value: testAudioBytes,
          filename: 'explanation.wav',
          type: 'audio/wav',
        },
      ])

      const evalResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/evaluations/feynman',
        headers: {
          authorization: `Bearer ${session.token}`,
          'content-type': payload.contentType,
        },
        payload: payload.body,
      })

      expect(evalResponse.statusCode).toBe(200)
      const evalId = evalResponse.json().evaluationId

      const audioResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/evaluations/${evalId}/audio`,
        headers: { authorization: `Bearer ${session.token}` },
      })

      expect(audioResponse.statusCode).toBe(200)
      expect(audioResponse.headers['content-type']).toContain('audio/wav')
      expect(audioResponse.rawPayload).toEqual(testAudioBytes)
    })

    it("returns 404 for another user's evaluation audio", async () => {
      const owner = await registerTestUser(app, { email: 'audio-owner@test.com' })
      const intruder = await registerTestUser(app, { email: 'audio-intruder@test.com' })
      await upgradeToPro(app, owner)
      const note = await createTestNote(app, owner)

      const payload = multipart([
        { name: 'noteId', value: note.id },
        {
          name: 'audioFile',
          value: Buffer.alloc(256, 1),
          filename: 'explanation.webm',
          type: 'audio/webm',
        },
      ])

      const evalResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/evaluations/feynman',
        headers: {
          authorization: `Bearer ${owner.token}`,
          'content-type': payload.contentType,
        },
        payload: payload.body,
      })

      const evalId = evalResponse.json().evaluationId

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/evaluations/${evalId}/audio`,
        headers: { authorization: `Bearer ${intruder.token}` },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error.code).toBe('EVALUATION_NOT_FOUND')
    })

    it('returns 404 AUDIO_NOT_FOUND for deleted audio file', async () => {
      const session = await registerTestUser(app, { email: 'deleted-audio@test.com' })
      await upgradeToPro(app, session)
      const note = await createTestNote(app, session)

      const payload = multipart([
        { name: 'noteId', value: note.id },
        {
          name: 'audioFile',
          value: Buffer.alloc(256, 1),
          filename: 'explanation.webm',
          type: 'audio/webm',
        },
      ])

      const evalResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/evaluations/feynman',
        headers: {
          authorization: `Bearer ${session.token}`,
          'content-type': payload.contentType,
        },
        payload: payload.body,
      })

      const evalId = evalResponse.json().evaluationId

      // Delete the file from storage
      const evalDoc = await Evaluation.findById(fromPublicEvalId(evalId))
      expect(evalDoc?.audioUrl).toBeTruthy()
      await deleteAudioFile(evalDoc!.audioUrl!)

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/evaluations/${evalId}/audio`,
        headers: { authorization: `Bearer ${session.token}` },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error.code).toBe('AUDIO_NOT_FOUND')
    })
  })

  // Task 5 acceptance: storage save failure leaves zero Evaluation documents, unchanged usage & note
  describe('Evaluation rollback on storage save failure (Task 5)', () => {
    it('leaves zero Evaluation documents and an unchanged usage count and note when storage save throws', async () => {
      const session = await registerTestUser(app, { email: 'storage-fail@test.com' })
      await upgradeToPro(app, session)
      const note = await createTestNote(app, session)

      const initialEvals = await Evaluation.countDocuments({
        userId: fromPublicUserId(session.user.id),
      })
      const initialUsage = await UsageRecord.countDocuments({
        userId: fromPublicUserId(session.user.id),
      })
      const noteBefore = await Note.findById(fromPublicNoteId(note.id))

      // Make storage.save throw
      const storage = getAudioStorage()
      const origSave = storage.save.bind(storage)
      storage.save = vi.fn(async () => {
        throw new Error('Disk full error simulated')
      })

      const payload = multipart([
        { name: 'noteId', value: note.id },
        {
          name: 'audioFile',
          value: Buffer.alloc(256, 1),
          filename: 'explanation.webm',
          type: 'audio/webm',
        },
      ])

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/evaluations/feynman',
        headers: {
          authorization: `Bearer ${session.token}`,
          'content-type': payload.contentType,
        },
        payload: payload.body,
      })

      expect(response.statusCode).toBe(500)

      // Verify zero new evaluation documents
      const finalEvals = await Evaluation.countDocuments({
        userId: fromPublicUserId(session.user.id),
      })
      expect(finalEvals).toBe(initialEvals)

      // Verify usage unchanged
      const finalUsage = await UsageRecord.countDocuments({
        userId: fromPublicUserId(session.user.id),
      })
      expect(finalUsage).toBe(initialUsage)

      // Verify note unchanged
      const noteAfter = await Note.findById(fromPublicNoteId(note.id))
      expect(noteAfter?.practiceCount).toBe(noteBefore?.practiceCount ?? 0)

      // Verify PipelineRun status is failed
      const failedRun = await PipelineRun.findOne({
        userId: fromPublicUserId(session.user.id),
      }).sort({ createdAt: -1 })
      expect(failedRun).toBeTruthy()
      expect(failedRun?.status).toBe('failed')

      storage.save = origSave
    })
  })

  // Task 2 acceptance: specific Whisper STT errors mapped to ApiError, response never contains key
  describe('Whisper STT error mapping (Task 2)', () => {
    const errorCases: Array<{
      kind: 'auth' | 'upstream' | 'rate_limit' | 'bad_audio' | 'empty' | 'timeout' | 'not_configured'
      expectedStatus: number
      expectedCode: string
    }> = [
      { kind: 'auth', expectedStatus: 502, expectedCode: 'STT_UPSTREAM_ERROR' },
      { kind: 'upstream', expectedStatus: 502, expectedCode: 'STT_UPSTREAM_ERROR' },
      { kind: 'rate_limit', expectedStatus: 502, expectedCode: 'STT_UPSTREAM_ERROR' },
      { kind: 'bad_audio', expectedStatus: 422, expectedCode: 'AUDIO_UNPROCESSABLE' },
      { kind: 'empty', expectedStatus: 422, expectedCode: 'NO_SPEECH_DETECTED' },
      { kind: 'timeout', expectedStatus: 504, expectedCode: 'STT_TIMEOUT' },
      { kind: 'not_configured', expectedStatus: 503, expectedCode: 'STT_NOT_CONFIGURED' },
    ]

    for (const { kind, expectedStatus, expectedCode } of errorCases) {
      it(`maps SttError kind "${kind}" to HTTP ${expectedStatus} ${expectedCode} without leaking API key`, async () => {
        const session = await registerTestUser(app, { email: `stt-err-${kind}@test.com` })
        await upgradeToPro(app, session)
        const note = await createTestNote(app, session)

        const fakeKey = 'sk-secret-whisper-api-key-999'

        // Mock createSTTProvider to return a provider that throws SttError with the secret key in message
        vi.spyOn(ports, 'createSTTProvider').mockReturnValue({
          transcribe: vi.fn(async () => {
            throw new SttError(kind, `Failed with ${fakeKey}`, 500)
          }),
        })

        const payload = multipart([
          { name: 'noteId', value: note.id },
          {
            name: 'audioFile',
            value: Buffer.alloc(256, 1),
            filename: 'explanation.webm',
            type: 'audio/webm',
          },
        ])

        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/evaluations/feynman',
          headers: {
            authorization: `Bearer ${session.token}`,
            'content-type': payload.contentType,
          },
          payload: payload.body,
        })

        expect(response.statusCode).toBe(expectedStatus)
        expect(response.json().error.code).toBe(expectedCode)
        // Ensure API key never leaks
        expect(response.body).not.toContain(fakeKey)
      })
    }
  })
})
