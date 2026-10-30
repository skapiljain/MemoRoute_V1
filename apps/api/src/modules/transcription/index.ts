import type { FastifyInstance, FastifyRequest } from 'fastify'
import multipart from '@fastify/multipart'
import { env } from '../../config/env.js'
import { authGuard } from '../../shared/middleware/auth-guard.js'
import { userRateLimitGuard } from '../../shared/middleware/user-rate-limit-guard.js'
import { ApiError } from '../../shared/utils/api-error.js'
import { transcriptionRateLimitGuard } from './transcription-rate-limit.js'
import { transcriptionFieldsSchema } from './transcription.schemas.js'
import { transcribeAudio } from './transcription.service.js'

interface UploadedAudio {
  buffer?: Buffer
  mimeType?: string
  language?: string
  topic?: string
  durationSeconds?: string
}

async function readUpload(request: FastifyRequest): Promise<UploadedAudio> {
  if (!request.isMultipart()) {
    throw new ApiError(400, 'AUDIO_REQUIRED', 'Upload an audio file as multipart form data.')
  }

  const upload: UploadedAudio = {}

  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'audioFile' && part.fieldname !== 'file') {
          await part.toBuffer()
          continue
        }
        upload.buffer = await part.toBuffer()
        upload.mimeType = part.mimetype
        continue
      }

      const value = String(part.value)
      if (part.fieldname === 'language') upload.language = value
      if (part.fieldname === 'topic') upload.topic = value
      if (part.fieldname === 'durationSeconds') upload.durationSeconds = value
    }
  } catch (error) {
    if (isFileTooLarge(error)) {
      throw new ApiError(413, 'FILE_TOO_LARGE', 'The recording is larger than the upload limit.')
    }
    throw error
  }

  return upload
}

function isFileTooLarge(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: string; statusCode?: number }
  return candidate.code === 'FST_REQ_FILE_TOO_LARGE' || candidate.statusCode === 413
}

export async function transcriptionRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/',
    { preHandler: [authGuard, userRateLimitGuard, transcriptionRateLimitGuard] },
    async (request, reply) => {
      const upload = await readUpload(request)

      if (!upload.buffer || !upload.mimeType) {
        throw new ApiError(400, 'AUDIO_REQUIRED', 'An audio file is required.')
      }

      const fields = transcriptionFieldsSchema.safeParse({
        ...(upload.language ? { language: upload.language } : {}),
        ...(upload.topic ? { topic: upload.topic } : {}),
        ...(upload.durationSeconds ? { durationSeconds: upload.durationSeconds } : {}),
      })

      if (!fields.success) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid transcription options.', {
          issues: fields.error.flatten().fieldErrors,
        })
      }

      const result = await transcribeAudio({
        userId: request.user!.id,
        audio: upload.buffer,
        declaredMimeType: upload.mimeType,
        language: fields.data.language,
        topic: fields.data.topic,
        durationSeconds: fields.data.durationSeconds,
      })

      request.log.info(
        {
          mimeType: result.metadata.mimeType,
          sizeBytes: result.metadata.sizeBytes,
          model: result.metadata.model,
          durationSeconds: result.metadata.durationSeconds,
        },
        'transcription completed',
      )

      return reply.send(result)
    },
  )
}

export async function transcriptionModule(app: FastifyInstance): Promise<void> {
  await app.register(
    async (scopedApp) => {
      await scopedApp.register(multipart, {
        limits: {
          fileSize: env.GROQ_STT_MAX_BYTES,
          files: 1,
          fields: 4,
        },
      })
      await scopedApp.register(transcriptionRoutes)
    },
    { prefix: '/api/v1/transcription' },
  )
}
