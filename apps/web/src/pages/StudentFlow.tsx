import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  FileUp,
  Mic,
  Plus,
  Type,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNotes, type NoteItem } from '../context/NotesContext'
import { ThemeToggle } from '../components/ThemeToggle'
import { GlassCard } from '../components/GlassCard'
import { ShinyButton } from '../components/ui/shiny-button'
import { ApiError } from '../lib/api/client'
import { submitTextEvaluation, submitVoiceEvaluation } from '../lib/api/evaluations.api'

const today = () => new Date().toISOString().slice(0, 10)

function dateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`)
  if (value === today()) return 'Today'
  return new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(date)
}

function StudentHeader() {
  const { user, logout } = useAuth()
  return (
    <header className="border-b border-white/10 bg-[#171311]/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/student" className="flex items-center gap-2 text-sm font-bold tracking-tight text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e8c89b]/25 bg-[#e8c89b]/10 text-[#e8c89b]">
            <BookOpen className="h-4 w-4" />
          </span>
          MemoRoute
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <span className="hidden text-sm text-white/60 sm:block">{user?.name}</span>
          <button onClick={() => void logout()} className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white/70 transition hover:border-[#e8c89b]/40 hover:text-[#e8c89b]">
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}

function StudentPage({ children, eyebrow, title, description }: { children: ReactNode; eyebrow: string; title: string; description?: string }) {
  return (
    <div className="theme-page min-h-screen text-[#f5efe8]">
      <StudentHeader />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-9 sm:px-6 sm:pt-12">
        <Link to="/student" className="mb-6 inline-flex items-center gap-2 text-xs font-semibold text-[#e8c89b] transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Student home
        </Link>
        <div className="mb-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#e8c89b]">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{description}</p>}
        </div>
        {children}
      </main>
    </div>
  )
}

interface StudyActivity {
  currentStreak: number
  studyDays: number
  lastActive: string
}

function updateStudyActivity(isDemo: boolean): StudyActivity {
  const key = 'memoroute_study_activity'
  let saved: StudyActivity | null = null
  try {
    const raw = localStorage.getItem(key)
    saved = raw ? (JSON.parse(raw) as StudyActivity) : null
  } catch {
    saved = null
  }
  const currentDay = today()
  if (!saved) {
    const initial = { currentStreak: isDemo ? 5 : 1, studyDays: isDemo ? 19 : 1, lastActive: currentDay }
    localStorage.setItem(key, JSON.stringify(initial))
    return initial
  }
  if (saved.lastActive === currentDay) return saved
  const elapsed = Math.floor((new Date(`${currentDay}T00:00:00`).getTime() - new Date(`${saved.lastActive}T00:00:00`).getTime()) / 86_400_000)
  const next = {
    currentStreak: elapsed === 1 ? saved.currentStreak + 1 : 1,
    studyDays: saved.studyDays + 1,
    lastActive: currentDay,
  }
  localStorage.setItem(key, JSON.stringify(next))
  return next
}

function UpcomingCalendar({ notes }: { notes: NoteItem[] }) {
  const [monthOffset, setMonthOffset] = useState(0)
  const monthDate = new Date()
  monthDate.setDate(1)
  monthDate.setMonth(monthDate.getMonth() + monthOffset)
  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(monthDate)
  const firstWeekday = monthDate.getDay()
  const dayCount = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
  const events = useMemo(() => notes.flatMap((note) => note.nextReviewDate ? [{ date: note.nextReviewDate.slice(0, 10), subject: note.subject, topic: note.title }] : []), [notes])
  const eventDates = new Set(events.map((event) => event.date))
  const upcoming = events.filter((event) => event.date >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4)

  return (
    <GlassCard dark className="border border-white/10 p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#e8c89b]">Your schedule</p>
          <h2 className="mt-1 text-xl font-bold text-white">Upcoming subjects</h2>
        </div>
        <CalendarDays className="h-5 w-5 text-[#e8c89b]" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">{monthLabel}</p>
            <div className="flex gap-1">
              <button aria-label="Previous month" onClick={() => setMonthOffset((value) => value - 1)} className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
              <button aria-label="Next month" onClick={() => setMonthOffset((value) => value + 1)} className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`} className="pb-2 text-[10px] font-bold text-white/35">{day}</span>)}
            {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}
            {Array.from({ length: dayCount }, (_, index) => {
              const date = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
              const isToday = date === today()
              return <span key={date} className={`relative mx-auto flex h-9 w-9 items-center justify-center rounded-xl text-xs ${isToday ? 'bg-[#e8c89b] font-bold text-[#211b18]' : eventDates.has(date) ? 'bg-[#e8c89b]/15 text-[#f5efe8]' : 'text-white/55'}`}>
                {index + 1}{eventDates.has(date) && !isToday && <i className="absolute bottom-1 h-1 w-1 rounded-full bg-[#e8c89b]" />}
              </span>
            })}
          </div>
        </div>
        <div className="space-y-2">
          {upcoming.length ? upcoming.map((event, index) => (
            <div key={`${event.topic}-${event.date}-${index}`} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.035] px-3.5 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e8c89b]/10 text-[#e8c89b]"><BookOpen className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-white">{event.topic}</span><span className="mt-0.5 block text-[10px] text-white/45">{event.subject}</span></span>
              <span className="text-[10px] text-[#e8c89b]">{dateLabel(event.date)}</span>
            </div>
          )) : <div className="flex h-full min-h-28 items-center justify-center rounded-2xl border border-dashed border-white/10 px-4 text-center text-xs text-white/45">Your upcoming review topics will appear here.</div>}
        </div>
      </div>
    </GlassCard>
  )
}

export function StudentDashboard() {
  const { isAuthenticated, user, isDemo } = useAuth()
  const { notes } = useNotes()
  const navigate = useNavigate()
  const [activity, setActivity] = useState<StudyActivity>({ currentStreak: 0, studyDays: 0, lastActive: '' })

  useEffect(() => setActivity(updateStudyActivity(isDemo)), [isDemo])
  if (!isAuthenticated) return <Navigate to="/login" replace />

  return (
    <div className="theme-page min-h-screen text-[#f5efe8]">
      <StudentHeader />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#e8c89b]">Your learning space</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Hi, {user?.name ?? 'Student'}.</h1>
            <p className="mt-2 text-sm text-white/55">A little recall today goes a long way.</p>
          </div>
          {isDemo && <span className="w-fit rounded-full border border-[#e8c89b]/25 bg-[#e8c89b]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#e8c89b]">Hackathon demo</span>}
        </motion.section>

        <section className="mb-5 grid gap-4 sm:grid-cols-2">
          <GlassCard dark className="flex items-center gap-4 border border-orange-300/15 p-5">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-400/10 text-orange-300"><Flame className="h-6 w-6" /></span>
            <div><p className="text-2xl font-bold text-white">{activity.currentStreak} days</p><p className="text-xs text-white/50">Current study streak</p></div>
          </GlassCard>
          <GlassCard dark className="flex items-center gap-4 border border-[#e8c89b]/15 p-5">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8c89b]/10 text-[#e8c89b]"><CalendarDays className="h-5 w-5" /></span>
            <div><p className="text-2xl font-bold text-white">{activity.studyDays} days</p><p className="text-xs text-white/50">Total days studying with MemoRoute</p></div>
          </GlassCard>
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-2">
          <button onClick={() => navigate('/revisions')} className="group flex min-h-36 items-center justify-between rounded-3xl border border-[#e8c89b]/35 bg-gradient-to-br from-[#e8c89b]/15 to-white/[0.035] p-6 text-left transition hover:border-[#e8c89b]/65 hover:from-[#e8c89b]/20">
            <span><span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8c89b]/15 text-[#e8c89b]"><BookOpen className="h-5 w-5" /></span><span className="block text-lg font-bold text-white">Start today’s revisions</span><span className="mt-1 block text-xs text-white/50">Pick up where your memory needs you</span></span>
            <ArrowRight className="h-5 w-5 text-[#e8c89b] transition-transform group-hover:translate-x-1" />
          </button>
          <button onClick={() => navigate('/topics/new')} className="group flex min-h-36 items-center justify-between rounded-3xl border border-white/10 bg-white/[0.035] p-6 text-left transition hover:border-white/25 hover:bg-white/[0.06]">
            <span><span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white/80"><Plus className="h-5 w-5" /></span><span className="block text-lg font-bold text-white">Add a newly studied topic</span><span className="mt-1 block text-xs text-white/50">Save notes and schedule your first recall</span></span>
            <ArrowRight className="h-5 w-5 text-white/55 transition-transform group-hover:translate-x-1" />
          </button>
        </section>

        <UpcomingCalendar notes={notes} />
      </main>
    </div>
  )
}

export function RevisionSubjectsPage() {
  const { isAuthenticated } = useAuth()
  const { notes } = useNotes()
  const due = useMemo(() => {
    const dueNotes = notes.filter((note) => note.nextReviewDate && note.nextReviewDate.slice(0, 10) <= today())
    return (dueNotes.length ? dueNotes : notes).slice().sort((a, b) => (a.nextReviewDate ?? '').localeCompare(b.nextReviewDate ?? ''))
  }, [notes])
  const subjects = new Set(due.map((note) => note.subject)).size
  if (!isAuthenticated) return <Navigate to="/login" replace />

  return (
    <StudentPage eyebrow="Daily recall" title="Today’s revisions" description="Choose a subject to start with. Keep each answer simple and explain it like you’re teaching a friend.">
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <GlassCard dark className="border border-[#e8c89b]/20 p-5"><p className="text-3xl font-bold text-white">{subjects}</p><p className="mt-1 text-xs text-white/50">{subjects === 1 ? 'subject' : 'subjects'} in your revision queue</p></GlassCard>
        <GlassCard dark className="border border-white/10 p-5"><p className="text-3xl font-bold text-white">{due.length}</p><p className="mt-1 text-xs text-white/50">topics ready to learn</p></GlassCard>
      </div>
      {due.length ? <div className="grid gap-3 sm:grid-cols-2">
        {due.map((note, index) => <motion.article key={note.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-5">
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-[#e8c89b]">{note.subject}</p><h2 className="mt-1 truncate text-lg font-semibold text-white">{note.title}</h2><p className="mt-1 flex items-center gap-1.5 text-[11px] text-white/45"><Clock3 className="h-3 w-3" />{note.nextReviewDate ? dateLabel(note.nextReviewDate.slice(0, 10)) : 'Ready when you are'}</p></div>
          <Link to={`/practice/${note.id}`} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#e8c89b] px-4 py-2.5 text-xs font-bold text-[#211b18] transition hover:bg-[#f2d8b5]">Learn <ArrowRight className="h-3.5 w-3.5" /></Link>
        </motion.article>)}
      </div> : <GlassCard dark className="border border-dashed border-white/15 p-10 text-center"><p className="text-lg font-semibold text-white">Your revision list is clear.</p><p className="mt-2 text-sm text-white/50">Add a topic you studied today and it will appear here.</p><Link to="/topics/new" className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#e8c89b] px-5 py-3 text-xs font-bold text-[#211b18]">Add a topic <Plus className="h-4 w-4" /></Link></GlassCard>}
    </StudentPage>
  )
}

export function NewTopicPage() {
  const { isAuthenticated } = useAuth()
  const { notes, addNote } = useNotes()
  const navigate = useNavigate()
  const subjects = Array.from(new Set([...notes.map((note) => note.subject), 'Computer Science', 'Biology', 'Mathematics'])).filter(Boolean)
  const [topic, setTopic] = useState('')
  const [subject, setSubject] = useState(subjects[0] ?? 'Computer Science')
  const [notesText, setNotesText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  if (!isAuthenticated) return <Navigate to="/login" replace />

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!topic.trim()) {
      setError('Add a topic name to continue.')
      return
    }
    setSaving(true)
    try {
      let content = notesText.trim()
      if (file && /\.(txt|md|markdown)$/i.test(file.name)) content = await file.text()
      if (!content) content = file ? `Study material uploaded: ${file.name}` : `# ${topic.trim()}\n\nAdd a few notes about what you studied.`
      const note = await addNote({
        title: topic.trim(),
        subject: subject.trim(),
        icon: 'book',
        content,
        nextReviewDate: today(),
        practiceQuestions: [{ id: `q-${Date.now()}`, question: `Explain ${topic.trim()} in your own words.`, adopted: true, source: 'user' }],
      })
      navigate(`/practice/${note.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this topic.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <StudentPage eyebrow="New learning" title="What did you study today?" description="Add the topic and subject, then attach your notes. We’ll put it in your revision flow right away.">
      <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <GlassCard dark className="space-y-5 border border-white/10 p-6 sm:p-8">
          <label className="block"><span className="mb-2 block text-xs font-semibold text-white/75">Topic name</span><input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. Photosynthesis" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#e8c89b]/60" /></label>
          <label className="block"><span className="mb-2 block text-xs font-semibold text-white/75">Subject name</span><input list="student-subjects" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Biology" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#e8c89b]/60" /><datalist id="student-subjects">{subjects.map((item) => <option key={item} value={item} />)}</datalist></label>
          <label className="block"><span className="mb-2 block text-xs font-semibold text-white/75">Notes or key ideas <span className="font-normal text-white/35">(optional)</span></span><textarea rows={7} value={notesText} onChange={(event) => setNotesText(event.target.value)} placeholder="Paste a short summary, key terms, or class notes…" className="w-full resize-y rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm leading-6 text-white outline-none transition placeholder:text-white/30 focus:border-[#e8c89b]/60" /></label>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <ShinyButton type="submit" label={saving ? 'Saving topic…' : 'Save topic & start learning'} disabled={saving} accentColor="#e8c89b" accentSoftColor="#f5efe8" fillColor="#2b2421" cornerRadius={9999} className="px-6 py-3.5 text-sm font-semibold" />
        </GlassCard>
        <div className="space-y-4">
          <label className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-[#e8c89b]/30 bg-[#e8c89b]/[0.045] p-7 text-center transition hover:border-[#e8c89b]/60 hover:bg-[#e8c89b]/[0.08]">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8c89b]/10 text-[#e8c89b]"><FileUp className="h-6 w-6" /></span>
            <span className="text-sm font-semibold text-white">{file ? file.name : 'Upload study material'}</span>
            <span className="mt-1 text-xs text-white/45">PDF, DOCX, TXT, or Markdown</span>
            <input type="file" accept=".pdf,.docx,.txt,.md,.markdown" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="sr-only" />
          </label>
          {file && <button type="button" onClick={() => setFile(null)} className="text-xs text-white/45 underline decoration-white/20 underline-offset-4 hover:text-white">Remove file</button>}
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-xs leading-5 text-white/45">Text and Markdown files are read into your topic notes. For PDF or DOCX, the file name is saved with the topic so you can add a summary above.</div>
        </div>
      </form>
    </StudentPage>
  )
}

export function PracticeQuestionPage() {
  const { isAuthenticated, isDemo } = useAuth()
  const { notes, recordPracticeSession, applyEvaluationResult } = useNotes()
  const { noteId = '' } = useParams()
  const note = notes.find((item) => item.id === noteId)
  const [mode, setMode] = useState<'text' | 'voice'>('text')
  const [answer, setAnswer] = useState('')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [recording, setRecording] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const question = note?.practiceQuestions?.[0]?.question ?? `Explain ${note?.title ?? 'this topic'} in your own words.`

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), [])
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!note) return <StudentPage eyebrow="Daily recall" title="Topic not found" description="Return to your revision list or add this topic again."><Link to="/revisions" className="inline-flex items-center gap-2 rounded-full bg-[#e8c89b] px-5 py-3 text-xs font-bold text-[#211b18]">Back to revisions <ArrowRight className="h-4 w-4" /></Link></StudentPage>

  const startRecording = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      streamRef.current = stream
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = () => {
        setAudioBlob(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        setRecording(false)
      }
      recorder.start()
      setRecording(true)
    } catch {
      setError('Microphone access is unavailable. Allow microphone access or switch to typing.')
    }
  }

  const stopRecording = () => recorderRef.current?.stop()
  const submitAnswer = async () => {
    if (mode === 'text' && !answer.trim()) { setError('Write a short answer before continuing.'); return }
    if (mode === 'voice' && !audioBlob) { setError('Record your answer before continuing.'); return }
    setSubmitting(true)
    setError('')
    try {
      if (isDemo) {
        recordPracticeSession(note.id, 8.8, 88, 86, 84, mode)
      } else if (mode === 'text') {
        const result = await submitTextEvaluation({ noteId: note.id, explanationText: answer, questionId: note.practiceQuestions?.[0]?.id })
        await applyEvaluationResult(result, 'text')
      } else {
        const result = await submitVoiceEvaluation({ noteId: note.id, audioBlob: audioBlob!, filename: `answer.${audioBlob!.type.includes('mp4') ? 'mp4' : 'webm'}`, questionId: note.practiceQuestions?.[0]?.id })
        await applyEvaluationResult(result, 'voice')
      }
      setSubmitted(true)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : caught instanceof Error ? caught.message : 'Could not save your answer.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <StudentPage eyebrow={`${note.subject} · ${note.title}`} title={submitted ? 'Nice work. Revision complete.' : 'Your recall question'} description={submitted ? 'You’ve finished this topic for today. Keep your streak going with another subject.' : 'Say or write the answer from memory. You can keep it simple and explain it in your own words.'}>
      {submitted ? <GlassCard dark className="max-w-3xl border border-emerald-300/20 p-7 sm:p-9"><div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300"><Check className="h-5 w-5" /></span><div><h2 className="text-xl font-bold text-white">Answer saved</h2><p className="mt-2 text-sm text-white/55">{note.title} is back in your spaced revision plan.</p></div></div><div className="mt-6 flex flex-wrap gap-3"><Link to="/revisions" className="inline-flex items-center gap-2 rounded-full bg-[#e8c89b] px-5 py-3 text-xs font-bold text-[#211b18]">Next subject <ArrowRight className="h-4 w-4" /></Link><Link to="/student" className="rounded-full border border-white/15 px-5 py-3 text-xs font-semibold text-white/75">Back to home</Link></div></GlassCard> : <div className="grid gap-5 lg:grid-cols-[1fr_0.72fr]">
        <GlassCard dark className="border border-[#e8c89b]/20 p-6 sm:p-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#e8c89b]">Question 1</p>
          <h2 className="mt-3 text-xl font-semibold leading-8 text-white sm:text-2xl">{question}</h2>
          <div className="mt-7 flex gap-2 rounded-2xl border border-white/8 bg-black/15 p-1.5">
            <button onClick={() => setMode('text')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-bold ${mode === 'text' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'}`}><Type className="h-4 w-4" /> Type answer</button>
            <button onClick={() => setMode('voice')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-bold ${mode === 'voice' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'}`}><Mic className="h-4 w-4" /> Speak answer</button>
          </div>
          {mode === 'text' ? <textarea rows={8} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Start with what you remember…" className="mt-4 w-full resize-y rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-[#e8c89b]/50" /> : <div className="mt-4 flex min-h-52 flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/20 p-6 text-center"><span className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${recording ? 'bg-rose-400/10 text-rose-300' : 'bg-[#e8c89b]/10 text-[#e8c89b]'}`}><Mic className="h-6 w-6" /></span><p className="text-sm font-semibold text-white">{recording ? 'Recording your answer…' : audioBlob ? 'Voice answer recorded' : 'Explain it out loud'}</p><p className="mt-1 text-xs text-white/45">{audioBlob ? 'Ready to save your revision.' : 'Use your microphone to answer from memory.'}</p>{recording ? <button onClick={stopRecording} className="mt-5 rounded-full bg-rose-500/15 px-5 py-2.5 text-xs font-bold text-rose-200">Stop recording</button> : <button onClick={() => void startRecording()} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#e8c89b] px-5 py-2.5 text-xs font-bold text-[#211b18]"><Mic className="h-3.5 w-3.5" />{audioBlob ? 'Record again' : 'Start recording'}</button>}</div>}
          {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
          <div className="mt-5 flex justify-end"><ShinyButton label={submitting ? 'Saving…' : 'Save answer'} onClick={() => void submitAnswer()} disabled={submitting || recording} accentColor="#e8c89b" accentSoftColor="#f5efe8" fillColor="#2b2421" cornerRadius={9999} className="px-6 py-3 text-sm font-semibold" /></div>
        </GlassCard>
        <GlassCard dark className="h-fit border border-white/10 p-6"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">A gentle reminder</p><h3 className="mt-3 text-lg font-semibold text-white">Recall first. Review after.</h3><p className="mt-2 text-sm leading-6 text-white/50">Try to explain the idea without looking at your notes. It’s okay to pause and think.</p><div className="mt-5 rounded-2xl border border-[#e8c89b]/15 bg-[#e8c89b]/[0.06] p-4"><p className="text-xs leading-5 text-[#e8c89b]/85">Topic</p><p className="mt-1 text-sm font-semibold text-white">{note.title}</p><p className="mt-1 text-xs text-white/45">{note.subject}</p></div></GlassCard>
      </div>}
    </StudentPage>
  )
}
