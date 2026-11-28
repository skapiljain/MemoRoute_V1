import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  FileUp,
  Mic,
  Plus,
  Type,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNotes } from '../context/NotesContext'
import { GlassCard } from '../components/GlassCard'
import { StudentCalendar } from '../components/dashboard/StudentCalendar'
import { ApiError } from '../lib/api/client'
import { submitTextEvaluation, submitVoiceEvaluation } from '../lib/api/evaluations.api'

const today = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function dateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`)
  if (value === today()) return 'Today'
  return new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(date)
}

function StudentHeader() {
  const { user, logout } = useAuth()
  return (
    <header className="border-b border-white/10 bg-[#151719]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/student" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8c89b]/10 text-[#e8c89b]"><BookOpen className="h-4 w-4" /></span>
          MemoRoute
        </Link>
        <nav className="flex items-center gap-3 sm:gap-6" aria-label="Student navigation">
          <Link to="/student" className="text-xs text-white/65 transition hover:text-white sm:text-sm">Home</Link>
          <Link to="/revisions" className="text-xs text-white/65 transition hover:text-white sm:text-sm">Revisions</Link>
          <Link to="/topics/new" className="hidden text-sm text-white/65 transition hover:text-white sm:block">Add topic</Link>
          <span className="hidden text-sm text-white/45 md:block">{user?.name}</span>
          <button type="button" onClick={() => void logout()} className="rounded-md border border-white/10 px-3 py-2 text-xs font-medium text-white/65 transition hover:bg-white/5 hover:text-white">Sign out</button>
        </nav>
      </div>
    </header>
  )
}

function StudentPage({ children, eyebrow, title, description }: { children: ReactNode; eyebrow: string; title: string; description?: string }) {
  return (
    <div className="theme-page min-h-screen text-[#f5efe8]">
      <StudentHeader />
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-7 sm:px-6 sm:pt-10">
        <Link to="/student" className="mb-5 inline-flex items-center gap-2 text-xs font-medium text-white/50 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
        <div className="mb-7">
          <p className="text-xs font-semibold text-[#e8c89b]">{eyebrow}</p>
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

export function StudentDashboard() {
  const { isAuthenticated, user, isDemo } = useAuth()
  const { notes, importantDates, studyMode, examTargetDate, examTitle, isLoading, refreshError, refreshFromApi, addImportantDate } = useNotes()
  const [activity] = useState<StudyActivity>(() => updateStudyActivity(isDemo))
  const due = useMemo(() => notes
    .filter((note) => note.nextReviewDate && note.nextReviewDate.slice(0, 10) <= today())
    .sort((a, b) => (a.nextReviewDate ?? '').localeCompare(b.nextReviewDate ?? '')),
  [notes])

  if (!isAuthenticated) return <Navigate to="/login" replace />

  return (
    <div className="theme-page min-h-screen text-[#f5efe8]">
      <StudentHeader />
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-9 sm:px-6 sm:pt-12">
        <section className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-white/50">Your study space</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Welcome back, {user?.name ?? 'Student'}.</h1>
            <p className="mt-2 text-sm text-white/55">Start with what is ready for review.</p>
          </div>
          {isDemo && <span className="w-fit rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/50">Demo account</span>}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-7" aria-labelledby="today-title">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[#e8c89b]">Today</p>
              <h2 id="today-title" className="mt-1 text-2xl font-semibold text-white">{due.length ? `${due.length} ${due.length === 1 ? 'topic' : 'topics'} ready to review` : 'You’re all caught up'}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">{due.length ? 'Practice from memory, then move on with your day.' : 'Add something you studied today and we’ll help you build a review routine.'}</p>
            </div>
            <Link to={due.length ? '/revisions' : '/topics/new'} className="inline-flex w-fit shrink-0 items-center gap-2 rounded-lg bg-[#e8c89b] px-4 py-3 text-sm font-semibold text-[#211b18] transition hover:bg-[#f0d8b6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8c89b]">
              {due.length ? 'Start reviewing' : 'Add a topic'} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {due.length > 0 && (
            <ul className="mt-6 divide-y divide-white/8 border-t border-white/10">
              {due.slice(0, 3).map((note) => (
                <li key={note.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{note.title}</p><p className="mt-1 text-xs text-white/45">{note.subject} · {note.nextReviewDate ? dateLabel(note.nextReviewDate.slice(0, 10)) : 'Ready'}</p></div>
                  <Link to={`/practice/${note.id}`} className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[#e8c89b] hover:text-white">Practice <ArrowRight className="h-3.5 w-3.5" /></Link>
                </li>
              ))}
              {due.length > 3 && <li className="pt-3"><Link to="/revisions" className="text-xs font-medium text-white/55 hover:text-white">View all {due.length} topics</Link></li>}
            </ul>
          )}
        </section>

        <p className="mt-5 text-xs text-white/40">{activity.currentStreak} day study streak · {activity.studyDays} total study days</p>

        <StudentCalendar
          notes={notes}
          importantDates={importantDates}
          studyMode={studyMode}
          examTargetDate={examTargetDate}
          examTitle={examTitle}
          isLoading={isLoading}
          refreshError={refreshError}
          onRetry={refreshFromApi}
          addImportantDate={addImportantDate}
        />
      </main>
    </div>
  )
}

export function RevisionSubjectsPage() {
  const { isAuthenticated } = useAuth()
  const { notes } = useNotes()
  const due = useMemo(() => notes
    .filter((note) => note.nextReviewDate && note.nextReviewDate.slice(0, 10) <= today())
    .slice()
    .sort((a, b) => (a.nextReviewDate ?? '').localeCompare(b.nextReviewDate ?? '')),
  [notes])
  const subjects = new Set(due.map((note) => note.subject)).size
  if (!isAuthenticated) return <Navigate to="/login" replace />

  return (
    <StudentPage eyebrow="Daily recall" title="Today’s revisions" description="Choose a subject to start with. Keep each answer simple and explain it like you’re teaching a friend.">
      <p className="mb-5 text-sm text-white/50">{due.length} {due.length === 1 ? 'topic' : 'topics'} across {subjects} {subjects === 1 ? 'subject' : 'subjects'}</p>
      {due.length ? <div className="grid gap-3 sm:grid-cols-2">
        {due.map((note, index) => <motion.article key={note.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
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
      <form onSubmit={handleSubmit} className="max-w-3xl">
        <GlassCard dark className="space-y-5 border border-white/10 p-5 sm:p-7">
          <label className="block"><span className="mb-2 block text-sm font-medium text-white/80">Topic name</span><input required value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. Photosynthesis" className="w-full rounded-lg border border-white/12 bg-black/15 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e8c89b]/60 focus-visible:ring-2 focus-visible:ring-[#e8c89b]/20" /></label>
          <label className="block"><span className="mb-2 block text-sm font-medium text-white/80">Subject</span><input list="student-subjects" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Biology" className="w-full rounded-lg border border-white/12 bg-black/15 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#e8c89b]/60 focus-visible:ring-2 focus-visible:ring-[#e8c89b]/20" /><datalist id="student-subjects">{subjects.map((item) => <option key={item} value={item} />)}</datalist></label>
          <label className="block"><span className="mb-2 block text-sm font-medium text-white/80">Notes <span className="font-normal text-white/40">(optional)</span></span><textarea rows={5} value={notesText} onChange={(event) => setNotesText(event.target.value)} placeholder="Add a short summary or a few key ideas…" className="w-full resize-y rounded-lg border border-white/12 bg-black/15 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/35 focus:border-[#e8c89b]/60 focus-visible:ring-2 focus-visible:ring-[#e8c89b]/20" /></label>
          <details className="rounded-lg border border-white/10 px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-white/70"><FileUp className="h-4 w-4 text-[#e8c89b]" /> Attach study material <span className="font-normal text-white/40">(optional)</span></summary>
            <div className="mt-4">
              <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-xs font-medium text-white/75 transition hover:bg-white/5">
                <FileUp className="h-4 w-4" /> Choose a file
                <input type="file" accept=".pdf,.docx,.txt,.md,.markdown" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="sr-only" />
              </label>
              <p className="mt-2 text-xs text-white/45">PDF, DOCX, TXT, or Markdown. Text and Markdown files are added to your notes.</p>
              {file && <div className="mt-3 flex items-center gap-3 text-xs text-white/70"><span className="truncate">{file.name}</span><button type="button" onClick={() => setFile(null)} className="shrink-0 text-white/45 underline underline-offset-2 hover:text-white">Remove</button></div>}
            </div>
          </details>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button type="submit" disabled={saving} className="rounded-lg bg-[#e8c89b] px-5 py-3 text-sm font-semibold text-[#211b18] transition hover:bg-[#f0d8b6] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8c89b]">
            {saving ? 'Saving topic…' : 'Save and start learning'}
          </button>
        </GlassCard>
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
    <StudentPage eyebrow={`${note.subject} · ${note.title}`} title={submitted ? 'Nice work. Revision complete.' : 'Your recall question'} description={submitted ? 'You’ve finished this topic for today. It will return when it is ready for review.' : 'Say or write the answer from memory. You can keep it simple and explain it in your own words.'}>
      {submitted ? <GlassCard dark className="max-w-3xl border border-emerald-300/20 p-7 sm:p-9"><div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><Check className="h-5 w-5" /></span><div><h2 className="text-xl font-bold text-white">Answer saved</h2><p className="mt-2 text-sm text-white/55">{note.title} is back in your spaced revision plan.</p></div></div><div className="mt-6 flex flex-wrap gap-3"><Link to="/revisions" className="inline-flex items-center gap-2 rounded-lg bg-[#e8c89b] px-5 py-3 text-xs font-bold text-[#211b18]">Next topic <ArrowRight className="h-4 w-4" /></Link><Link to="/student" className="rounded-lg border border-white/15 px-5 py-3 text-xs font-semibold text-white/75">Back to home</Link></div></GlassCard> : <div className="max-w-3xl">
        <GlassCard dark className="border border-[#e8c89b]/20 p-6 sm:p-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#e8c89b]">Question 1</p>
          <h2 className="mt-3 text-xl font-semibold leading-8 text-white sm:text-2xl">{question}</h2>
          <div className="mt-7 flex gap-2 rounded-lg border border-white/8 bg-black/15 p-1.5">
            <button type="button" onClick={() => setMode('text')} className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-3 text-xs font-bold ${mode === 'text' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'}`}><Type className="h-4 w-4" /> Type answer</button>
            <button type="button" onClick={() => setMode('voice')} className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-3 text-xs font-bold ${mode === 'voice' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'}`}><Mic className="h-4 w-4" /> Speak answer</button>
          </div>
          {mode === 'text' ? <textarea rows={8} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Start with what you remember…" className="mt-4 w-full resize-y rounded-lg border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/35 focus:border-[#e8c89b]/50 focus-visible:ring-2 focus-visible:ring-[#e8c89b]/20" /> : <div className="mt-4 flex min-h-52 flex-col items-center justify-center rounded-lg border border-white/10 bg-black/20 p-6 text-center"><span className={`mb-4 flex h-14 w-14 items-center justify-center rounded-lg ${recording ? 'bg-rose-400/10 text-rose-300' : 'bg-[#e8c89b]/10 text-[#e8c89b]'}`}><Mic className="h-6 w-6" /></span><p className="text-sm font-semibold text-white">{recording ? 'Recording your answer…' : audioBlob ? 'Voice answer recorded' : 'Explain it out loud'}</p><p className="mt-1 text-xs text-white/45">{audioBlob ? 'Ready to save your revision.' : 'Use your microphone to answer from memory.'}</p>{recording ? <button type="button" onClick={stopRecording} className="mt-5 rounded-md bg-rose-500/15 px-5 py-2.5 text-xs font-bold text-rose-200">Stop recording</button> : <button type="button" onClick={() => void startRecording()} className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#e8c89b] px-5 py-2.5 text-xs font-bold text-[#211b18]"><Mic className="h-3.5 w-3.5" />{audioBlob ? 'Record again' : 'Start recording'}</button>}</div>}
          {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
          <div className="mt-5 flex justify-end"><button type="button" onClick={() => void submitAnswer()} disabled={submitting || recording} className="rounded-lg bg-[#e8c89b] px-5 py-3 text-sm font-semibold text-[#211b18] transition hover:bg-[#f0d8b6] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8c89b]">{submitting ? 'Saving…' : 'Save answer'}</button></div>
        </GlassCard>
      </div>}
    </StudentPage>
  )
}
