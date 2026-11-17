import { api, authenticatedFetch, ApiError } from './client'
import { extensionForRecordingMime } from '../audio/recording-format'

function extensionForBlob(blob: Blob): string {
  return extensionForRecordingMime(blob.type || 'audio/webm')
}

export interface SubConceptScore {
  name: string
  covered: boolean
  score: number
}

export interface RetentionImpact {
  intervalDays: number
  reason: string
}

export interface PracticeQuestion {
  id: string
  question: string
  score?: number
  adopted: boolean
  source: 'ai' | 'user'
  lastAnsweredAt?: string
}

export interface FeynmanEvaluationResponse {
  evaluationId: string
  noteId: string
  lectorScore: number
  correctness: number
  clarity: number
  completeness: number
  transcript?: string
  feedback: {
    strengths: string[]
    missingConcepts: string[]
    improvementTip: string
  }
  subConcepts: SubConceptScore[]
  misconceptions: string[]
  nextPrompt: string
  retentionImpact: RetentionImpact
  answeredQuestionId?: string
  practiceQuestions: PracticeQuestion[]
  updatedNoteState: {
    practiceCount: number
    lastPracticed: string
    retentionHealth: number
    nextReviewDate: string
  }
}

export interface EvaluationDetail {
  id: string
  noteId: string
  mode: 'voice' | 'text'
  lectorScore: number
  correctness: number
  clarity: number
  completeness: number
  transcript?: string
  feedback: FeynmanEvaluationResponse['feedback']
  subConcepts: SubConceptScore[]
  misconceptions: string[]
  nextPrompt?: string
  retentionImpact?: RetentionImpact
  audioUrl?: string
  createdAt: string
}

export async function submitTextEvaluation(input: {
  noteId: string
  explanationText: string
  selfRating?: number
  questionId?: string
}): Promise<FeynmanEvaluationResponse> {
  return api<FeynmanEvaluationResponse>('/evaluations/feynman', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function submitVoiceEvaluation(input: {
  noteId: string
  audioBlob: Blob
  filename?: string
  selfRating?: number
  questionId?: string
}): Promise<FeynmanEvaluationResponse> {
  const formData = new FormData()
  formData.append('noteId', input.noteId)
  if (input.questionId) formData.append('questionId', input.questionId)
  const ext = extensionForBlob(input.audioBlob)
  const baseName = input.filename ? input.filename.replace(/\.[^/.]+$/, '') : 'explanation'
  const uploadFilename = `${baseName}.${ext}`
  formData.append('audioFile', input.audioBlob, uploadFilename)
  if (input.selfRating != null) {
    formData.append('selfRating', String(input.selfRating))
  }

  const response = await authenticatedFetch('/evaluations/feynman', {
    method: 'POST',
    body: formData,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      typeof data?.error?.message === 'string' ? data.error.message : 'Evaluation failed'
    const code = typeof data?.error?.code === 'string' ? data.error.code : 'API_ERROR'
    throw new ApiError(response.status, code, message)
  }

  return data as FeynmanEvaluationResponse
}

export async function listEvaluations(): Promise<EvaluationDetail[]> {
  return api<EvaluationDetail[]>('/evaluations')
}

export function getEvaluationAudioUrl(evaluationId: string): string {
  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'
  return `${apiBase}/evaluations/${evaluationId}/audio`
}

export async function fetchEvaluationAudioObjectUrl(evaluationId: string): Promise<string> {
  const response = await authenticatedFetch(`/evaluations/${evaluationId}/audio`)

  if (!response.ok) {
    throw new Error('Failed to load evaluation audio')
  }

  const blob = await response.blob()
  return URL.createObjectURL(blob)
}
