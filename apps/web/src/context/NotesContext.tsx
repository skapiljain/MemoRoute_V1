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
  createImportantDate,
  deleteImportantDate as deleteImportantDateApi,
  fetchCalendarSettings,
  fetchImportantDates,
  updateCalendarSettings,
} from '../lib/api/calendar.api'
import { useApi } from '../lib/api/client'
import { fetchDashboardSummary } from '../lib/api/dashboard.api'
import type { FeynmanEvaluationResponse } from '../lib/api/evaluations.api'
import {
  createNote as createNoteApi,
  deleteNote as deleteNoteApi,
  fetchNotes,
  updateNote as updateNoteApi,
} from '../lib/api/notes.api'
import { resolveNoteTitle } from '../lib/note-title'
import { useAuth } from './AuthContext'

function defaultExamTargetDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return date.toISOString().split('T')[0]
}

async function syncResolvedNoteTitles(notesData: NoteItem[]): Promise<NoteItem[]> {
  const nextNotes = [...notesData]

  for (const note of notesData) {
    const resolvedTitle = resolveNoteTitle(note.title, note.content)
    if (resolvedTitle === note.title) continue

    try {
      const updated = await updateNoteApi(note.id, { title: resolvedTitle })
      const index = nextNotes.findIndex((item) => item.id === note.id)
      if (index >= 0) {
        nextNotes[index] = updated
      }
    } catch {
      const index = nextNotes.findIndex((item) => item.id === note.id)
      if (index >= 0) {
        nextNotes[index] = { ...nextNotes[index], title: resolvedTitle }
      }
    }
  }

  return nextNotes
}

export interface NoteItem {
  id: string
  title: string
  subject: string
  content: string
  icon: string
  createdAt: string
  updatedAt: string
  lectorScore?: number
  practiceCount: number
  lastPracticed?: string
  retentionHealth: number
  nextReviewDate?: string
  interval?: number
  repetition?: number
  similarity?: number
  practiceQuestions?: PracticeQuestion[]
}

export interface PracticeQuestion {
  id: string
  question: string
  score?: number
  adopted: boolean
  source: 'ai' | 'user'
  lastAnsweredAt?: string
}

export interface PracticeExplanation {
  id: string
  noteId: string
  topic: string
  subject: string
  score: number
  correctness: number
  clarity: number
  completeness: number
  mode: 'voice' | 'text'
  timestamp: string
  transcript?: string
  audioUrl?: string
}

export interface ImportantDateItem {
  id: string
  title: string
  date: string
  subject: string
  priority: 'high' | 'medium' | 'low'
  description?: string
}

export type StudyModeType = 'exam' | 'skill'

interface NotesContextValue {
  notes: NoteItem[]
  explanations: PracticeExplanation[]
  importantDates: ImportantDateItem[]
  studyMode: StudyModeType
  examTargetDate: string
  examTitle: string
  isLoading: boolean
  refreshError: string | null
  setStudyMode: (mode: StudyModeType, date?: string, title?: string) => void
  activeNoteId: string | null
  setActiveNoteId: (id: string | null) => void
  addNote: (
    note: Omit<NoteItem, 'id' | 'createdAt' | 'updatedAt' | 'practiceCount' | 'retentionHealth'>,
  ) => Promise<NoteItem>
  updateNote: (id: string, updates: Partial<NoteItem>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  recordPracticeSession: (
    noteId: string,
    score: number,
    correctness: number,
    clarity: number,
    completeness: number,
    mode: 'voice' | 'text',
  ) => void
  applyEvaluationResult: (result: FeynmanEvaluationResponse, mode: 'voice' | 'text') => Promise<void>
  refreshFromApi: () => Promise<void>
  addImportantDate: (item: Omit<ImportantDateItem, 'id'>) => Promise<void>
  deleteImportantDate: (id: string) => Promise<void>
  avgLectorScore: number
  totalSessionsToday: number
  retentionAverage: number
}

const NOTES_STORAGE_KEY = 'memoroute_notion_notes'
const EXPLANATIONS_STORAGE_KEY = 'memoroute_practice_explanations'
const DATES_STORAGE_KEY = 'memoroute_important_dates'

function dateAfterDays(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const DEFAULT_NOTES: NoteItem[] = [
  {
    id: 'note-1',
    title: 'Binary Search Trees',
    subject: 'Computer Science',
    icon: 'code',
    content: `# Binary Search Trees (BST)\n\nA Binary Search Tree is a node-based binary tree data structure. The left subtree contains smaller keys, while the right subtree contains larger keys. Each subtree follows the same rule.`,
    createdAt: dateAfterDays(-6),
    updatedAt: dateAfterDays(-1),
    lectorScore: 9.2,
    practiceCount: 4,
    lastPracticed: dateAfterDays(-1),
    retentionHealth: 84,
    nextReviewDate: dateAfterDays(0),
    practiceQuestions: [
      { id: 'q-bst-1', question: 'Explain how a binary search tree keeps values ordered.', adopted: true, source: 'ai' },
    ],
  },
  {
    id: 'note-2',
    title: 'Cellular Respiration',
    subject: 'Biology',
    icon: 'flask',
    content: '# Cellular Respiration\n\nCells convert glucose into usable energy through glycolysis, the Krebs cycle, and oxidative phosphorylation.',
    createdAt: dateAfterDays(-4),
    updatedAt: dateAfterDays(-2),
    lectorScore: 8.7,
    practiceCount: 2,
    lastPracticed: dateAfterDays(-2),
    retentionHealth: 76,
    nextReviewDate: dateAfterDays(0),
    practiceQuestions: [
      { id: 'q-cell-1', question: 'How does cellular respiration turn glucose into energy a cell can use?', adopted: true, source: 'ai' },
    ],
  },
  {
    id: 'note-3',
    title: 'Linear Equations',
    subject: 'Mathematics',
    icon: 'sigma',
    content: '# Linear Equations\n\nA linear equation describes a relationship where the highest power of each variable is one.',
    createdAt: dateAfterDays(-2),
    updatedAt: dateAfterDays(-2),
    practiceCount: 1,
    retentionHealth: 72,
    nextReviewDate: dateAfterDays(2),
    practiceQuestions: [
      { id: 'q-linear-1', question: 'What makes an equation linear, and how can you solve one?', adopted: true, source: 'ai' },
    ],
  },
]

const DEFAULT_EXPLANATIONS: PracticeExplanation[] = []
const DEFAULT_IMPORTANT_DATES: ImportantDateItem[] = []

const NotesContext = createContext<NotesContextValue | null>(null)

function todayDateStr(): string {
  return new Date().toISOString().split('T')[0]
}

export function NotesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isDemo } = useAuth()
  const apiMode = useApi && isAuthenticated && !isDemo
  const shouldPersistLocal = !useApi || isDemo

  const [notes, setNotes] = useState<NoteItem[]>(() => {
    if (useApi && !isDemo) return []
    try {
      const saved = localStorage.getItem(NOTES_STORAGE_KEY)
      return saved ? (JSON.parse(saved) as NoteItem[]) : DEFAULT_NOTES
    } catch {
      return DEFAULT_NOTES
    }
  })

  const [explanations, setExplanations] = useState<PracticeExplanation[]>(() => {
    if (useApi && !isDemo) return []
    try {
      const saved = localStorage.getItem(EXPLANATIONS_STORAGE_KEY)
      return saved ? (JSON.parse(saved) as PracticeExplanation[]) : DEFAULT_EXPLANATIONS
    } catch {
      return DEFAULT_EXPLANATIONS
    }
  })

  const [importantDates, setImportantDates] = useState<ImportantDateItem[]>(() => {
    if (useApi && !isDemo) return []
    try {
      const saved = localStorage.getItem(DATES_STORAGE_KEY)
      return saved ? (JSON.parse(saved) as ImportantDateItem[]) : DEFAULT_IMPORTANT_DATES
    } catch {
      return DEFAULT_IMPORTANT_DATES
    }
  })

  const [studyMode, setStudyModeState] = useState<StudyModeType>(() => {
    if (useApi && !isDemo) return 'exam'
    try {
      const saved = localStorage.getItem('memoroute_study_mode')
      return saved ? (saved as StudyModeType) : 'exam'
    } catch {
      return 'exam'
    }
  })

  const [examTargetDate, setExamTargetDate] = useState<string>(() => {
    if (useApi && !isDemo) return ''
    try {
      return localStorage.getItem('memoroute_exam_target_date') || '2026-09-25'
    } catch {
      return '2026-09-25'
    }
  })

  const [examTitle, setExamTitle] = useState<string>(() => {
    if (useApi && !isDemo) return ''
    try {
      return localStorage.getItem('memoroute_exam_title') || 'Final CS Midterm Exam'
    } catch {
      return 'Final CS Midterm Exam'
    }
  })

  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [dashboardStats, setDashboardStats] = useState({
    avgLectorScore: 0,
    totalSessionsToday: 0,
    retentionAverage: 70,
  })

  const refreshFromApi = useCallback(async () => {
    if (!apiMode) return
    setIsLoading(true)
    setRefreshError(null)
    try {
      const [notesData, settings, dates, summary] = await Promise.all([
        fetchNotes(),
        fetchCalendarSettings(),
        fetchImportantDates(),
        fetchDashboardSummary(),
      ])
      const syncedNotes = await syncResolvedNoteTitles(notesData)
      setNotes(syncedNotes)
      setStudyModeState(settings.studyMode)
      if (settings.examTargetDate) {
        setExamTargetDate(settings.examTargetDate)
      } else if (settings.studyMode === 'exam') {
        setExamTargetDate(defaultExamTargetDate())
      }
      if (settings.examTitle) {
        setExamTitle(settings.examTitle)
      } else if (settings.studyMode === 'exam') {
        setExamTitle('Final Exam')
      }
      setImportantDates(dates)
      setExplanations(summary.recentExplanations)
      setDashboardStats({
        avgLectorScore: summary.avgLectorScore,
        totalSessionsToday: summary.totalSessionsToday,
        retentionAverage: summary.retentionAverage,
      })
      if (notesData.length > 0) {
        setActiveNoteId((current) => current ?? notesData[0].id)
      }
    } catch (caught) {
      setRefreshError(caught instanceof Error ? caught.message : 'Could not load your latest study data.')
    } finally {
      setIsLoading(false)
    }
  }, [apiMode])

  useEffect(() => {
    if (apiMode) {
      void refreshFromApi()
    }
  }, [apiMode, refreshFromApi])

  useEffect(() => {
    if (!useApi) return
    if (!isDemo) {
      setNotes([])
      setExplanations([])
      setImportantDates([])
      return
    }

    const read = <T,>(key: string, fallback: T): T => {
      try {
        const raw = localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as T) : fallback
      } catch {
        return fallback
      }
    }
    const storedNotes = read<NoteItem[]>(NOTES_STORAGE_KEY, [])
    setNotes(storedNotes.length ? storedNotes : DEFAULT_NOTES)
    setExplanations(read(EXPLANATIONS_STORAGE_KEY, DEFAULT_EXPLANATIONS))
    setImportantDates(read(DATES_STORAGE_KEY, DEFAULT_IMPORTANT_DATES))
    setStudyModeState(read('memoroute_study_mode', 'exam'))
    setExamTargetDate(read('memoroute_exam_target_date', defaultExamTargetDate()))
    setExamTitle(read('memoroute_exam_title', 'Final Exam'))
  }, [isDemo])

  useEffect(() => {
    if (!shouldPersistLocal) return
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
  }, [notes, shouldPersistLocal])

  useEffect(() => {
    if (!shouldPersistLocal) return
    localStorage.setItem(EXPLANATIONS_STORAGE_KEY, JSON.stringify(explanations))
  }, [explanations, shouldPersistLocal])

  useEffect(() => {
    if (!shouldPersistLocal) return
    localStorage.setItem(DATES_STORAGE_KEY, JSON.stringify(importantDates))
  }, [importantDates, shouldPersistLocal])

  useEffect(() => {
    if (!shouldPersistLocal) return
    localStorage.setItem('memoroute_study_mode', studyMode)
  }, [studyMode, shouldPersistLocal])

  useEffect(() => {
    if (!shouldPersistLocal) return
    localStorage.setItem('memoroute_exam_target_date', examTargetDate)
  }, [examTargetDate, shouldPersistLocal])

  useEffect(() => {
    if (!shouldPersistLocal) return
    localStorage.setItem('memoroute_exam_title', examTitle)
  }, [examTitle, shouldPersistLocal])

  const setStudyMode = useCallback(
    async (mode: StudyModeType, date?: string, title?: string) => {
      setStudyModeState(mode)
      if (date) setExamTargetDate(date)
      if (title) setExamTitle(title)

      if (apiMode) {
        await updateCalendarSettings({
          studyMode: mode,
          examTargetDate: date ?? examTargetDate,
          examTitle: title ?? examTitle,
        })
      }
    },
    [apiMode, examTargetDate, examTitle],
  )

  const addNote = useCallback(
    async (
      noteData: Omit<NoteItem, 'id' | 'createdAt' | 'updatedAt' | 'practiceCount' | 'retentionHealth'>,
    ) => {
      if (apiMode) {
        const created = await createNoteApi(noteData)
        setNotes((prev) => [created, ...prev])
        setActiveNoteId(created.id)
        return created
      }

      const newId = `note-${Date.now()}`
      const todayStr = todayDateStr()
      const newNote: NoteItem = {
        ...noteData,
        id: newId,
        createdAt: todayStr,
        updatedAt: todayStr,
        practiceCount: 0,
        retentionHealth: 70,
      }
      setNotes((prev) => [newNote, ...prev])
      setActiveNoteId(newId)
      return newNote
    },
    [apiMode],
  )

  const updateNote = useCallback(
    async (id: string, updates: Partial<NoteItem>) => {
      if (apiMode) {
        const todayStr = todayDateStr()
        setNotes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, ...updates, updatedAt: todayStr } : n)),
        )
        const updated = await updateNoteApi(id, updates)
        setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)))
        return
      }

      const todayStr = todayDateStr()
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...updates, updatedAt: todayStr } : n)),
      )
    },
    [apiMode],
  )

  const deleteNote = useCallback(
    async (id: string) => {
      if (apiMode) {
        await deleteNoteApi(id)
        setNotes((prev) => prev.filter((n) => n.id !== id))
        setActiveNoteId((curr) => (curr === id ? null : curr))
        return
      }

      setNotes((prev) => prev.filter((n) => n.id !== id))
      setActiveNoteId((curr) => (curr === id ? null : curr))
    },
    [apiMode],
  )

  const addImportantDate = useCallback(
    async (item: Omit<ImportantDateItem, 'id'>) => {
      if (apiMode) {
        const created = await createImportantDate(item)
        setImportantDates((prev) => [created, ...prev])
        return
      }

      const newItem: ImportantDateItem = { ...item, id: `date-${Date.now()}` }
      setImportantDates((prev) => [newItem, ...prev])
    },
    [apiMode],
  )

  const deleteImportantDate = useCallback(
    async (id: string) => {
      if (apiMode) {
        await deleteImportantDateApi(id)
      }
      setImportantDates((prev) => prev.filter((d) => d.id !== id))
    },
    [apiMode],
  )

  const recordPracticeSession = useCallback(
    (
      noteId: string,
      score: number,
      correctness: number,
      clarity: number,
      completeness: number,
      mode: 'voice' | 'text',
    ) => {
      if (apiMode) return

      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16)
      const todayStr = todayDateStr()
      const targetNote = notes.find((n) => n.id === noteId)
      const topicName = targetNote ? targetNote.title : 'Custom Practice'
      const subjectName = targetNote ? targetNote.subject : 'General'

      let daysAdd = 3
      if (studyMode === 'exam' && examTargetDate) {
        const daysLeft = Math.max(
          1,
          Math.ceil((new Date(examTargetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        )
        daysAdd = Math.max(1, Math.min(2, Math.floor(daysLeft / 3)))
      }

      const nextDate = new Date()
      nextDate.setDate(nextDate.getDate() + daysAdd)
      const nextReviewStr = nextDate.toISOString().split('T')[0]

      setNotes((prev) =>
        prev.map((n) => {
          if (n.id === noteId) {
            return {
              ...n,
              lectorScore: score,
              practiceCount: n.practiceCount + 1,
              lastPracticed: todayStr,
              retentionHealth: Math.min(
                100,
                Math.round(correctness * 0.5 + clarity * 0.3 + completeness * 0.2),
              ),
              nextReviewDate: nextReviewStr,
              updatedAt: todayStr,
            }
          }
          return n
        }),
      )

      setExplanations((prev) => [
        {
          id: `exp-${Date.now()}`,
          noteId,
          topic: topicName,
          subject: subjectName,
          score,
          correctness,
          clarity,
          completeness,
          mode,
          timestamp: nowStr,
        },
        ...prev,
      ])
    },
    [notes, studyMode, examTargetDate, apiMode],
  )

  const applyEvaluationResult = useCallback(
    async (result: FeynmanEvaluationResponse, mode: 'voice' | 'text') => {
      if (!apiMode) {
        recordPracticeSession(
          result.noteId,
          result.lectorScore,
          result.correctness,
          result.clarity,
          result.completeness,
          mode,
        )
        return
      }

      setNotes((prev) =>
        prev.map((n) =>
          n.id === result.noteId
            ? {
                ...n,
                lectorScore: result.lectorScore,
                practiceCount: result.updatedNoteState.practiceCount,
                lastPracticed: result.updatedNoteState.lastPracticed,
                retentionHealth: result.updatedNoteState.retentionHealth,
                nextReviewDate: result.updatedNoteState.nextReviewDate,
              }
            : n,
        ),
      )

      await refreshFromApi()
    },
    [apiMode, recordPracticeSession, refreshFromApi],
  )

  const avgLectorScore = useMemo(() => {
    if (apiMode) return dashboardStats.avgLectorScore
    if (explanations.length === 0) return 0
    return Number(
      (explanations.reduce((acc, e) => acc + e.score, 0) / explanations.length).toFixed(2),
    )
  }, [apiMode, dashboardStats.avgLectorScore, explanations])

  const retentionAverage = useMemo(() => {
    if (apiMode) return dashboardStats.retentionAverage
    if (notes.length === 0) return 70
    return Math.round(notes.reduce((acc, n) => acc + (n.retentionHealth || 70), 0) / notes.length)
  }, [apiMode, dashboardStats.retentionAverage, notes])

  const totalSessionsToday = useMemo(() => {
    if (apiMode) return dashboardStats.totalSessionsToday
    return explanations.length
  }, [apiMode, dashboardStats.totalSessionsToday, explanations])

  const value = useMemo(
    () => ({
      notes,
      explanations,
      importantDates,
      studyMode,
      examTargetDate,
      examTitle,
      isLoading,
      refreshError,
      setStudyMode,
      activeNoteId,
      setActiveNoteId,
      addNote,
      updateNote,
      deleteNote,
      recordPracticeSession,
      applyEvaluationResult,
      refreshFromApi,
      addImportantDate,
      deleteImportantDate,
      avgLectorScore,
      totalSessionsToday,
      retentionAverage,
    }),
    [
      notes,
      explanations,
      importantDates,
      studyMode,
      examTargetDate,
      examTitle,
      isLoading,
      refreshError,
      setStudyMode,
      activeNoteId,
      addNote,
      updateNote,
      deleteNote,
      recordPracticeSession,
      applyEvaluationResult,
      refreshFromApi,
      addImportantDate,
      deleteImportantDate,
      avgLectorScore,
      totalSessionsToday,
      retentionAverage,
    ],
  )

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
}

export function useNotes() {
  const ctx = useContext(NotesContext)
  if (!ctx) throw new Error('useNotes must be used within NotesProvider')
  return ctx
}
