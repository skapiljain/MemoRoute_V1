import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { ensureDatabaseConnection } from '../db/connection.js'

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string
  }
}

export async function requestContextPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const incoming = request.headers['x-request-id']
    request.requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID()

    if (request.url.startsWith('/api/')) {
      await ensureDatabaseConnection()
    }
  })

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.requestId)
    return payload
  })
}
