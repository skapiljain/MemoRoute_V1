import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { env } from '../src/config/env.js'

describe('Health API Endpoint (/api/v1/health)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('loads API configuration from env schema', () => {
    expect(env.API_VERSION).toBeTruthy()
    expect(env.PORT).toBeGreaterThan(0)
  })

  it('GET /api/v1/health returns 200 with ok status and database connected', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    })

    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.status).toBe('ok')
    expect(json.version).toBe(env.API_VERSION)
    expect(json.database).toBe('connected')
    expect(json.features).toBeDefined()
    expect(json.timestamp).toBeDefined()
  })

  it('GET /api/health also returns 200 for backward compatibility', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('ok')
  })
})
