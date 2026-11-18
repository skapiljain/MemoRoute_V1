import { motion } from 'framer-motion'
import { ArrowRight, Brain, Eye, EyeOff, Lock, Mail, Sparkles, User } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from '../components/ThemeToggle'
import { ShinyButton } from '../components/ui/shiny-button'

export function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login, loginDemo, register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const resolvedName =
      mode === 'register' ? name.trim() || email.split('@')[0] || 'Learner' : name

    const result =
      mode === 'register'
        ? await register(resolvedName, email, password)
        : await login(email, password)

    setSubmitting(false)

    if (result.ok) {
      navigate('/student', { replace: true })
    } else {
      setError(result.error ?? 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="theme-page relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <div
        className="theme-glow-radial absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 30% 40%, rgba(232,200,155,0.2) 0%, transparent 50%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="glass-strong relative z-10 w-full max-w-md rounded-[2rem] p-8 sm:p-10"
      >
        <Link to="/" className="mb-8 flex items-center justify-center gap-2 text-white">
          <Brain className="h-7 w-7 text-gold-soft" />
          <span className="text-xl font-semibold">MemoRoute</span>
        </Link>

        <h1 className="mb-2 text-center text-2xl font-bold text-white">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="mb-8 text-center text-sm text-white/60">
          {mode === 'login'
            ? 'Sign in to continue your learning journey'
            : 'Register to sync notes, scores, and your adaptive calendar'}
        </p>

        {mode === 'login' && (
          <div className="mb-6">
            <button
              type="button"
              onClick={() => {
                loginDemo()
                navigate('/student', { replace: true })
              }}
              className="group flex w-full items-center justify-between rounded-2xl border border-[#e8c89b]/40 bg-[#e8c89b]/12 px-5 py-4 text-left transition hover:border-[#e8c89b]/70 hover:bg-[#e8c89b]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8c89b]"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8c89b]/20 text-[#e8c89b]">
                  <Sparkles className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">Demo login</span>
                  <span className="mt-0.5 block text-xs text-white/55">Continue as Alex Morgan · no account needed</span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-[#e8c89b] transition-transform group-hover:translate-x-1" />
            </button>
            <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-white/35">
              <span className="h-px flex-1 bg-white/10" />
              <span>or sign in</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === 'register' && (
            <div>
              <label className="mb-2 block text-sm font-medium text-white/80">Name</label>
              <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
                <User className="h-4 w-4 text-white/50" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full bg-transparent text-sm text-white placeholder:text-white/40 outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-white/80">Email</label>
            <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
              <Mail className="h-4 w-4 text-white/50" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-transparent text-sm text-white placeholder:text-white/40 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-white/80">Password</label>
            <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
              <Lock className="h-4 w-4 text-white/50" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-transparent text-sm text-white placeholder:text-white/40 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-white/50 hover:text-white"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-center text-sm text-red-300">{error}</p>}

          <ShinyButton
            type="submit"
            label={submitting ? 'Please wait…' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
            accentColor="#e8c89b"
            accentSoftColor="#f5efe8"
            fillColor="#2b2421"
            cornerRadius={9999}
            className="w-full py-3.5 text-sm font-semibold"
          />
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError('')
          }}
          className="mt-6 block w-full text-center text-sm text-[#e8c89b] transition hover:text-white"
        >
          {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
        </button>

        <Link
          to="/"
          className="mt-4 block text-center text-sm text-white/60 transition hover:text-white"
        >
          ← Back to Home
        </Link>
      </motion.div>
    </div>
  )
}
