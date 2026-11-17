import { Types } from 'mongoose'
import { Evaluation, type EvaluationDocument } from '../../models/Evaluation.js'
import { ImportantDate } from '../../models/ImportantDate.js'
import { Note, type NoteDocument } from '../../models/Note.js'
import { PipelineRun, runStage } from '../../models/PipelineRun.js'
import { User, type UserDocument } from '../../models/User.js'
import { createLLMProvider, createSTTProvider } from '../../shared/ports/index.js'
import { SttError } from '../../shared/ports/whisper-stt-provider.js'
import { deleteAudioFile, readAudioFile, saveAudioFile } from '../../shared/storage/audio-storage.js'
import { ApiError } from '../../shared/utils/api-error.js'
import { audioExtensionForMime } from '../../shared/utils/audio-format.js'
import { fromPublicEvalId, toPublicEvalId } from '../../shared/utils/eval-id.js'
import { fromPublicNoteId, toPublicNoteId } from '../../shared/utils/note-id.js'
import { fromPublicUserId } from '../../shared/utils/user-id.js'
import { applyReviewAfterEvaluation, type CalendarContext } from '../analytics/spaced-repetition.service.js'
import { scorePracticeQuestionOnNote } from '../notes/notes.service.js'
import {
  assertCanEvaluate,
  recordEvaluationUsage,
} from '../billing/usage-policy.service.js'
import { domainEvents } from '../../shared/events/domain-events.js'
import { serializeNote } from '../notes/notes.serializer.js'
import type { FeynmanEvaluationResponse } from './evaluations.schemas.js'
import { serializeEvaluationDetail } from './evaluations.serializer.js'

export interface SubmitFeynmanInput {
  noteId: string
  questionId?: string
  explanationText?: string
  audioBuffer?: Buffer
  audioMimeType?: string
  selfRating?: number
  mode: 'voice' | 'text'
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

async function buildCalendarContext(
  publicUserId: string,
  user: UserDocument,
  noteSubject: string,
): Promise<CalendarContext> {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const importantDate = await ImportantDate.findOne({
    userId: fromPublicUserId(publicUserId),
    subject: noteSubject,
    date: { $gte: today },
    priority: { $in: ['high', 'medium'] },
  }).sort({ date: 1 })

  return {
    studyMode: user.calendarSettings?.studyMode ?? 'exam',
    examTargetDate: user.calendarSettings?.examTargetDate,
    importantDateDeadline: importantDate?.date ?? null,
  }
}

async function findOwnedNote(publicUserId: string, noteId: string): Promise<NoteDocument> {
  const note = await Note.findOne({
    _id: fromPublicNoteId(noteId),
    userId: fromPublicUserId(publicUserId),
  })

  if (!note) {
    throw new ApiError(404, 'NOTE_NOT_FOUND', `Note with id ${noteId} not found`)
  }

  return note
}

async function findOwnedEvaluation(
  publicUserId: string,
  evaluationId: string,
): Promise<EvaluationDocument> {
  const item = await Evaluation.findOne({
    _id: fromPublicEvalId(evaluationId),
    userId: fromPublicUserId(publicUserId),
  })

  if (!item) {
    throw new ApiError(404, 'EVALUATION_NOT_FOUND', `Evaluation with id ${evaluationId} not found`)
  }

  return item
}

function convertSttError(error: SttError): ApiError {
  switch (error.kind) {
    case 'auth':
    case 'upstream':
    case 'rate_limit':
      return new ApiError(502, 'STT_UPSTREAM_ERROR', 'Speech-to-text service is temporarily unavailable')
    case 'bad_audio':
      return new ApiError(422, 'AUDIO_UNPROCESSABLE', 'The audio could not be processed by the transcription service')
    case 'empty':
      return new ApiError(422, 'NO_SPEECH_DETECTED', "We couldn't hear any speech, please try again")
    case 'timeout':
      return new ApiError(504, 'STT_TIMEOUT', 'Speech-to-text request timed out')
    case 'not_configured':
      return new ApiError(503, 'STT_NOT_CONFIGURED', 'Speech-to-text service is not configured')
    default:
      return new ApiError(502, 'STT_UPSTREAM_ERROR', 'Speech-to-text service is temporarily unavailable')
  }
}

export async function submitFeynmanEvaluation(
  publicUserId: string,
  input: SubmitFeynmanInput,
): Promise<FeynmanEvaluationResponse> {
  await assertCanEvaluate(publicUserId, input.mode)

  const note = await findOwnedNote(publicUserId, input.noteId)
  const user = await User.findById(fromPublicUserId(publicUserId))

  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'User not found')
  }

  // Generate the evaluation _id up front
  const evaluationId = new Types.ObjectId()
  const publicEvalId = toPublicEvalId(evaluationId)

  // Create PipelineRun tracking this evaluation
  const pipelineRun = await PipelineRun.create({
    userId: fromPublicUserId(publicUserId),
    kind: 'evaluation',
    refId: publicEvalId,
    status: 'running',
    stages: [],
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
  })

  let transcript = input.explanationText?.trim()
  let audioUrl: string | undefined

  try {
    if (input.mode === 'voice') {
      if (!input.audioBuffer || input.audioBuffer.length === 0) {
        throw new ApiError(400, 'AUDIO_REQUIRED', 'Audio file is required for voice evaluations')
      }

      const stt = createSTTProvider()
      transcript = await runStage(pipelineRun._id, 'transcription', async () => {
        try {
          return await stt.transcribe(input.audioBuffer!, input.audioMimeType ?? 'audio/webm')
        } catch (error) {
          if (error instanceof SttError) {
            throw convertSttError(error)
          }
          throw error
        }
      })
    }

    if (!transcript) {
      throw new ApiError(400, 'EXPLANATION_REQUIRED', 'An explanation transcript or text is required')
    }

    const llm = createLLMProvider()
    const result = await runStage(pipelineRun._id, 'llm_evaluation', async (setMeta) => {
      const evalResult = await llm.evaluateFeynman({
        sourceContent: note.content,
        userExplanation: transcript!,
        topic: note.title,
      })
      setMeta({
        lectorScore: evalResult.lectorScore,
        correctness: evalResult.correctness,
        clarity: evalResult.clarity,
        completeness: evalResult.completeness,
      })
      return evalResult
    })

    // Determine audio extension and save audio BEFORE creating the evaluation
    if (input.mode === 'voice' && input.audioBuffer) {
      const extension = audioExtensionForMime(input.audioMimeType ?? 'audio/webm')
      audioUrl = await runStage(pipelineRun._id, 'audio_storage', async () => {
        return await saveAudioFile(publicUserId, publicEvalId, input.audioBuffer!, extension)
      })
    }

    const todayStr = formatDateOnly(new Date())
    const calendarContext = await buildCalendarContext(publicUserId, user, note.subject)
    const reviewUpdate = applyReviewAfterEvaluation(
      {
        easinessFactor: note.easinessFactor,
        interval: note.interval,
        repetition: note.repetition,
      },
      {
        lectorScore: result.lectorScore,
        correctness: result.correctness,
        clarity: result.clarity,
        completeness: result.completeness,
      },
      calendarContext,
    )

    await runStage(pipelineRun._id, 'persistence', async () => {
      await Evaluation.create({
        _id: evaluationId,
        userId: fromPublicUserId(publicUserId),
        noteId: note._id,
        mode: input.mode,
        transcript,
        selfRating: input.selfRating,
        lectorScore: result.lectorScore,
        correctness: result.correctness,
        clarity: result.clarity,
        completeness: result.completeness,
        feedback: result.feedback,
        subConcepts: result.subConcepts,
        misconceptions: result.misconceptions,
        nextPrompt: result.nextPrompt,
        retentionImpact: result.retentionImpact,
        ...(audioUrl ? { audioUrl } : {}),
        ...(input.questionId ? { questionId: input.questionId } : {}),
      })

      await Note.findByIdAndUpdate(note._id, {
        $set: {
          lectorScore: result.lectorScore,
          practiceCount: note.practiceCount + 1,
          lastPracticed: new Date(`${todayStr}T00:00:00.000Z`),
          retentionHealth: reviewUpdate.retentionHealth,
          nextReviewDate: reviewUpdate.nextReviewDate,
          easinessFactor: reviewUpdate.easinessFactor,
          interval: reviewUpdate.interval,
          repetition: reviewUpdate.repetition,
        },
      })

      if (input.questionId) {
        await scorePracticeQuestionOnNote(
          publicUserId,
          input.noteId,
          input.questionId,
          result.lectorScore,
        )
      }

      await recordEvaluationUsage(publicUserId)
    })

    await PipelineRun.findByIdAndUpdate(pipelineRun._id, { status: 'succeeded' })

    const updatedNote = await Note.findById(note._id)

    domainEvents.emit('EvaluationCompleted', {
      userId: publicUserId,
      noteId: toPublicNoteId(note._id),
      evaluationId: publicEvalId,
      mode: input.mode,
    })

    return {
      evaluationId: publicEvalId,
      noteId: toPublicNoteId(note._id),
      lectorScore: result.lectorScore,
      correctness: result.correctness,
      clarity: result.clarity,
      completeness: result.completeness,
      transcript,
      feedback: result.feedback,
      subConcepts: result.subConcepts,
      misconceptions: result.misconceptions,
      nextPrompt: result.nextPrompt,
      retentionImpact: result.retentionImpact,
      updatedNoteState: {
        practiceCount: note.practiceCount + 1,
        lastPracticed: todayStr,
        retentionHealth: reviewUpdate.retentionHealth,
        nextReviewDate: formatDateOnly(reviewUpdate.nextReviewDate),
      },
      ...(input.questionId ? { answeredQuestionId: input.questionId } : {}),
      practiceQuestions: updatedNote ? serializeNote(updatedNote).practiceQuestions : [],
    }
  } catch (error) {
    if (audioUrl) {
      try {
        await deleteAudioFile(audioUrl)
      } catch {
        // Best-effort cleanup
      }
    }
    await PipelineRun.findByIdAndUpdate(pipelineRun._id, { status: 'failed' })
    throw error
  }
}

export async function listEvaluations(publicUserId: string) {
  const evaluations = await Evaluation.find({ userId: fromPublicUserId(publicUserId) })
    .sort({ createdAt: -1 })
    .limit(50)

  return evaluations.map(serializeEvaluationDetail)
}

export async function getEvaluation(publicUserId: string, evaluationId: string) {
  const evaluation = await findOwnedEvaluation(publicUserId, evaluationId)
  return serializeEvaluationDetail(evaluation)
}

export async function getEvaluationAudio(publicUserId: string, evaluationId: string) {
  const evaluation = await findOwnedEvaluation(publicUserId, evaluationId)

  if (!evaluation.audioUrl) {
    throw new ApiError(404, 'AUDIO_NOT_FOUND', 'No audio recording exists for this evaluation')
  }

  try {
    const { buffer, mimeType } = await readAudioFile(evaluation.audioUrl)
    return { buffer, mimeType }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    const name = (error as { name?: string }).name
    if (code === 'ENOENT' || name === 'NoSuchKey') {
      throw new ApiError(404, 'AUDIO_NOT_FOUND', 'Audio file not found')
    }
    throw error
  }
}
