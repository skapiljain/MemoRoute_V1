const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'

const TOKEN_KEY = 'memoroute_token'
const REFRESH_KEY = 'memoroute_refresh_token'
const AUTH_STORAGE_KEY = 'memoroute_auth'

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

interface AuthResponse {
  token: string
  refreshToken: string
  user: { id: string; name: string; email: string }
}

let refreshPromise: Promise<string | null> | null = null

function clearStoredSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY)
    if (!refreshToken) {
      return null
    }

    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    const data = (await response.json().catch(() => ({}))) as Partial<AuthResponse> & {
      error?: { message?: string }
    }

    if (!response.ok || !data.token || !data.refreshToken) {
      clearStoredSession()
      return null
    }

    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(REFRESH_KEY, data.refreshToken)
    if (data.user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data.user))
    }

    return data.token
  })()

  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

function buildAuthHeaders(
  token: string | null,
  options?: RequestInit,
): Record<string, string> {
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const optionHeaders = options?.headers
  if (optionHeaders instanceof Headers) {
    optionHeaders.forEach((value, key) => {
      headers[key] = value
    })
  } else if (Array.isArray(optionHeaders)) {
    for (const [key, value] of optionHeaders) {
      headers[key] = value
    }
  } else if (optionHeaders) {
    Object.assign(headers, optionHeaders)
  }

  return headers
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      typeof data?.error?.message === 'string' ? data.error.message : 'Request failed'
    const code = typeof data?.error?.code === 'string' ? data.error.code : 'API_ERROR'
    throw new ApiError(response.status, code, message)
  }

  return data as T
}

async function requestWithAuth<T>(
  path: string,
  options?: RequestInit,
  retried = false,
): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: buildAuthHeaders(token, options),
  })

  if (response.status === 401 && !retried) {
    let code = 'UNAUTHORIZED'
    try {
      const errorBody = await response.clone().json()
      if (typeof errorBody?.error?.code === 'string') {
        code = errorBody.error.code
      }
    } catch {
      // Ignore parse errors and attempt refresh for generic 401s.
    }

    if (code === 'INVALID_TOKEN' || code === 'UNAUTHORIZED') {
      const newToken = await refreshAccessToken()
      if (newToken) {
        return requestWithAuth<T>(path, options, true)
      }

      throw new ApiError(
        401,
        'SESSION_EXPIRED',
        'Your session has expired. Please sign in again.',
      )
    }
  }

  return parseApiResponse<T>(response)
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  return requestWithAuth<T>(path, options)
}

export async function authenticatedFetch(
  path: string,
  options?: RequestInit,
  retried = false,
): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY)

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: buildAuthHeaders(token, options),
  })

  if (response.status === 401 && !retried) {
    let code = 'UNAUTHORIZED'
    try {
      const errorBody = await response.clone().json()
      if (typeof errorBody?.error?.code === 'string') {
        code = errorBody.error.code
      }
    } catch {
      // Ignore parse errors and attempt refresh for generic 401s.
    }

    if (code === 'INVALID_TOKEN' || code === 'UNAUTHORIZED') {
      const newToken = await refreshAccessToken()
      if (newToken) {
        return authenticatedFetch(path, options, true)
      }

      throw new ApiError(
        401,
        'SESSION_EXPIRED',
        'Your session has expired. Please sign in again.',
      )
    }
  }

  return response
}

export const useApi = import.meta.env.VITE_USE_API === 'true'
