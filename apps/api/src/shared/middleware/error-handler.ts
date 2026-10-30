import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../../config/env.js'
import { ApiError } from '../utils/api-error.js'

function isMongoError(error: Error): boolean {
  return error.name.startsWith('Mongo') || error.name === 'MongooseError'
}

function mapMongoError(error: Error): ApiError | null {
  if (error.name === 'MongoServerError' && 'code' in error && error.code === 11000) {
    const keyPattern = 'keyPattern' in error ? (error.keyPattern as Record<string, unknown>) : {}
    if (keyPattern.email) {
      return new ApiError(409, 'EMAIL_EXISTS', 'An account with this email already exists')
    }
    return new ApiError(409, 'DUPLICATE_KEY', 'A record with this value already exists')
  }

  if (
    error.name === 'MongoNetworkError' ||
    error.name === 'MongoServerSelectionError' ||
    error.name === 'MongoNotConnectedError' ||
    error.message.includes('Client must be connected')
  ) {
    return new ApiError(
      503,
      'DATABASE_UNAVAILABLE',
      'Database is temporarily unavailable. Please try again in a moment.',
    )
  }

  return null
}

export function errorHandler(
  error: FastifyError | ApiError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof ApiError) {
    reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    })
    return
  }

  const fastifyError = error as FastifyError

  if (fastifyError.validation) {
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: fastifyError.validation,
      },
    })
    return
  }

  if (isMongoError(error)) {
    const mapped = mapMongoError(error)
    if (mapped) {
      request.log.warn({ err: error }, 'MongoDB error handled')
      reply.status(mapped.statusCode).send({
        error: {
          code: mapped.code,
          message: mapped.message,
        },
      })
      return
    }
  }

  if (env.isDev) {
    request.log.error({ err: error }, 'Unhandled request error')
  }

  const statusCode = fastifyError.statusCode ?? 500
  reply.status(statusCode).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: statusCode >= 500 ? 'Internal server error' : error.message,
    },
  })
}
