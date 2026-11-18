import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchCurrentUser,
  loginRequest,
  logoutRequest,
  registerRequest,
} from '../lib/api/auth.api'
import { useApi } from '../lib/api/client'

interface User {
  id?: string
  name: string
  email: string
}

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isDemo: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  loginDemo: () => void
  register: (name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = 'memoroute_auth'
const TOKEN_KEY = 'memoroute_token'
const REFRESH_KEY = 'memoroute_refresh_token'
const DEMO_KEY = 'memoroute_demo_mode'

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

function persistSession(user: User, token: string, refreshToken: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(REFRESH_KEY, refreshToken)
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(() => localStorage.getItem(DEMO_KEY) === 'true')
  const [user, setUser] = useState<User | null>(() => (useApi && localStorage.getItem(DEMO_KEY) !== 'true' ? null : loadUser()))
  const [isLoading, setIsLoading] = useState(useApi)

  useEffect(() => {
    if (!useApi) return

    if (localStorage.getItem(DEMO_KEY) === 'true') {
      setUser(loadUser())
      setIsDemo(true)
      setIsLoading(false)
      return
    }

    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setIsLoading(false)
      return
    }

    fetchCurrentUser()
      .then((current) => {
        setUser({ id: current.id, name: current.name, email: current.email })
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ id: current.id, name: current.name, email: current.email }),
        )
      })
      .catch(() => {
        clearSession()
        setUser(null)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    if (!email.trim() || !password.trim()) return { ok: false as const, error: 'Email and password are required.' }

    if (!useApi) {
      const nextUser = {
        name: email.split('@')[0] || 'Learner',
        email: email.trim(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser))
      localStorage.removeItem(DEMO_KEY)
      setIsDemo(false)
      setUser(nextUser)
      return { ok: true as const }
    }

    try {
      const response = await loginRequest(email.trim(), password)
      persistSession(
        { id: response.user.id, name: response.user.name, email: response.user.email },
        response.token,
        response.refreshToken,
      )
      localStorage.removeItem(DEMO_KEY)
      setIsDemo(false)
      setUser({ id: response.user.id, name: response.user.name, email: response.user.email })
      return { ok: true as const }
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : 'Invalid email or password.'
      return { ok: false as const, error: message }
    }
  }, [])

  const loginDemo = useCallback(() => {
    const demoUser = { name: 'Alex Morgan', email: 'alex@memoroute.demo' }
    clearSession()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demoUser))
    localStorage.setItem(DEMO_KEY, 'true')
    setIsDemo(true)
    setUser(demoUser)
    setIsLoading(false)
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const resolvedName = name.trim() || email.split('@')[0] || 'Learner'

    if (!email.trim() || !password.trim()) {
      return { ok: false as const, error: 'Email and password are required.' }
    }

    if (!useApi) {
      const result = await login(email, password)
      return result.ok ? { ok: true as const } : result
    }

    try {
      const response = await registerRequest(resolvedName, email.trim(), password)
      persistSession(
        { id: response.user.id, name: response.user.name, email: response.user.email },
        response.token,
        response.refreshToken,
      )
      localStorage.removeItem(DEMO_KEY)
      setIsDemo(false)
      setUser({ id: response.user.id, name: response.user.name, email: response.user.email })
      return { ok: true as const }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Could not create account. Email may already be registered.'
      return { ok: false as const, error: message }
    }
  }, [login])

  const logout = useCallback(async () => {
    if (useApi) {
      const refreshToken = localStorage.getItem(REFRESH_KEY)
      if (refreshToken) {
        await logoutRequest(refreshToken).catch(() => {})
      }
    }
    clearSession()
    localStorage.removeItem(DEMO_KEY)
    setIsDemo(false)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isDemo,
      isLoading,
      login,
      loginDemo,
      register,
      logout,
    }),
    [user, isDemo, isLoading, login, loginDemo, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
