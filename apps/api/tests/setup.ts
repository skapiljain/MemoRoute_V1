import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret-min-8-chars-long'
process.env.LLM_PROVIDER = 'openai'
process.env.STT_PROVIDER = 'whisper'
process.env.OPENAI_API_KEY = 'test-openai-key'
process.env.GROQ_API_KEY = 'test-groq-key'
process.env.GROQ_STT_MODEL = 'whisper-large-v3-turbo'
process.env.PAYMENT_PROVIDER = 'mock'
process.env.NOTIFICATION_PROVIDER = 'mock'
process.env.AUDIO_STORAGE = 'local'
process.env.EMBEDDING_PROVIDER = 'openai'
process.env.EMBEDDING_ENABLED = process.env.RUN_LIVE_TESTS === 'true' ? 'true' : 'false'
process.env.FEATURE_BILLING = 'true'
process.env.FEATURE_VOICE_EVAL = 'true'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  const uri = mongod.getUri()
  process.env.MONGODB_URI = uri
  await mongoose.connect(uri)
}, 60_000)

beforeEach(async () => {
  if (process.env.RUN_LIVE_TESTS !== 'true') {
    const ports = await import('../src/shared/ports/index.js')
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
    vi.spyOn(ports, 'createSTTProvider').mockReturnValue({
      transcribe: vi.fn(async () => 'This is a test transcript from audio recording.'),
    })
  }
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({})
  }
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})
