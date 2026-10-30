import { Copy, LoaderCircle, Mic, RotateCcw, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { GlassSkeleton } from '../ui/page-loader'
import { ApiError } from '../../lib/api/client'
import { transcribeExplanation } from '../../lib/api/transcription.api'
import {
  extensionForRecordingMime,
  MAX_AUDIO_BYTES,
  MAX_RECORDING_SECONDS,
  selectRecordingMimeType,
} from '../../lib/audio/recording-format'

export interface RecordedExplanation {
  blob: Blob
  mimeType: string
  filename: string
}

interface VoiceExplanationRecorderProps {
  topic?: string
  onAudioChange?: (audio: RecordedExplanation | null) => void
}

interface RecorderError {
  message: string
  retryable: boolean
}

export function VoiceExplanationRecorder({ topic, onAudioChange }: VoiceExplanationRecorderProps) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'transcribing' | 'error'>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [error, setError] = useState<RecorderError | null>(null)
  const [copied, setCopied] = useState(false)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const frameRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const playbackUrlRef = useRef<string | null>(null)
  const lastAudioRef = useRef<RecordedExplanation | null>(null)
  const busyRef = useRef(false)
  const transcriptRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    transcriptRef.current = transcript
  }, [transcript])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      releaseRecordingResources()
      if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current)
    }
  }, [])

  const releaseRecordingResources = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null
      recorderRef.current.stop()
    }
    recorderRef.current = null
    const context = audioContextRef.current
    audioContextRef.current = null
    if (context && context.state !== 'closed') {
      void context.close()
    }
  }

  const replacePlaybackUrl = (next: string | null) => {
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current)
    playbackUrlRef.current = next
    setPlaybackUrl(next)
  }

  const startLevelMeter = (stream: MediaStream) => {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return

    const context = new AudioContextCtor()
    audioContextRef.current = context
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    const samples = new Uint8Array(analyser.frequencyBinCount)

    const draw = () => {
      if (!streamRef.current) return
      const canvas = canvasRef.current
      if (!canvas) {
        frameRef.current = requestAnimationFrame(draw)
        return
      }
      const context2d = canvas.getContext('2d')
      if (!context2d) return

      analyser.getByteFrequencyData(samples)
      const width = canvas.width
      const height = canvas.height
      context2d.clearRect(0, 0, width, height)

      const bars = 24
      const gap = 4
      const barWidth = (width - gap * (bars - 1)) / bars
      for (let index = 0; index < bars; index += 1) {
        const sampleIndex = Math.floor((index / bars) * samples.length)
        const level = (samples[sampleIndex] ?? 0) / 255
        const barHeight = Math.max(4, level * height)
        context2d.fillStyle = '#e8c89b'
        context2d.fillRect(index * (barWidth + gap), height - barHeight, barWidth, barHeight)
      }

      frameRef.current = requestAnimationFrame(draw)
    }

    void context.resume()
    draw()
  }

  const transcribeBlob = async (audio: RecordedExplanation, durationSeconds: number, previousTranscript: string | null) => {
    if (mountedRef.current) {
      setPhase('transcribing')
      setError(null)
    }
    try {
      const result = await transcribeExplanation({
        audio: audio.blob,
        filename: audio.filename,
        topic,
        durationSeconds,
      })
      if (!mountedRef.current) return
      setTranscript(result.transcript)
      setPhase('idle')
    } catch (caught) {
      if (!mountedRef.current) return
      if (previousTranscript != null) setTranscript(previousTranscript)
      setError(describeTranscriptionError(caught))
      setPhase('error')
    }
  }

  const finishRecording = () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive' || busyRef.current) return

    busyRef.current = true
    const mimeType = recorder.mimeType || selectRecordingMimeType() || 'audio/webm'
    const previousTranscript = transcriptRef.current

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      chunksRef.current = []
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (timerRef.current != null) window.clearInterval(timerRef.current)
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
      const context = audioContextRef.current
      audioContextRef.current = null
      if (context && context.state !== 'closed') void context.close()
      recorderRef.current = null

      const durationSeconds = Math.max(0, (performance.now() - startedAtRef.current) / 1000)
      busyRef.current = false

      if (blob.size < 32 || durationSeconds < 0.4) {
        setError({
          message: 'That recording is too short. Hold the explanation for at least a moment and try again.',
          retryable: false,
        })
        setPhase('error')
        if (previousTranscript != null) setTranscript(previousTranscript)
        return
      }

      if (blob.size > MAX_AUDIO_BYTES) {
        setError({
          message: 'The recording is too large. Record a shorter explanation.',
          retryable: false,
        })
        setPhase('error')
        if (previousTranscript != null) setTranscript(previousTranscript)
        return
      }

      const recorded: RecordedExplanation = {
        blob,
        mimeType,
        filename: `explanation.${extensionForRecordingMime(mimeType)}`,
      }
      lastAudioRef.current = recorded
      onAudioChange?.(recorded)
      replacePlaybackUrl(URL.createObjectURL(blob))
      void transcribeBlob(recorded, durationSeconds, previousTranscript)
    }

    recorder.stop()
  }

  const startRecording = async () => {
    if (phase === 'recording' || phase === 'transcribing' || recorderRef.current) return

    const mimeType = selectRecordingMimeType()
    if (!mimeType) {
      setError({
        message: 'This browser cannot record a supported audio format. Try Chrome, Edge, or Firefox.',
        retryable: false,
      })
      setPhase('error')
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError({
        message: 'Microphone recording is unavailable in this browser.',
        retryable: false,
      })
      setPhase('error')
      return
    }

    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      if (recorderRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recorderRef.current = recorder
      streamRef.current = stream
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.start(1000)
      startedAtRef.current = performance.now()
      setElapsedSeconds(0)
      setPhase('recording')
      startLevelMeter(stream)
      timerRef.current = window.setInterval(() => {
        const seconds = Math.floor((performance.now() - startedAtRef.current) / 1000)
        setElapsedSeconds(seconds)
        if (seconds >= MAX_RECORDING_SECONDS) finishRecording()
      }, 250)
    } catch (caught) {
      releaseRecordingResources()
      setError(describeMicrophoneError(caught))
      setPhase('error')
    }
  }

  const retry = () => {
    const audio = lastAudioRef.current
    if (audio && error?.retryable) {
      const durationSeconds = Math.max(1, elapsedSeconds)
      void transcribeBlob(audio, durationSeconds, transcriptRef.current)
      return
    }
    void startRecording()
  }

  const discardTranscript = () => {
    setTranscript(null)
    setError(null)
    setPhase('idle')
    setElapsedSeconds(0)
    lastAudioRef.current = null
    onAudioChange?.(null)
    replacePlaybackUrl(null)
  }

  const copyTranscript = async () => {
    if (!transcript) return
    try {
      await navigator.clipboard.writeText(transcript)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError({ message: 'The transcript could not be copied. Select the text and copy it manually.', retryable: false })
    }
  }

  const showTranscript = transcript != null && phase !== 'recording' && phase !== 'transcribing'
  const statusText =
    phase === 'recording'
      ? 'Microphone is on. Recording your explanation.'
      : phase === 'transcribing'
        ? 'Transcribing your explanation.'
        : error
          ? error.message
          : showTranscript
            ? 'Transcription complete. You can edit the transcript.'
            : 'Ready to record an explanation.'

  return (
    <div className="space-y-6">
      <div className="sr-only" aria-live="polite">
        {statusText}
      </div>

      {phase === 'idle' && !showTranscript && (
        <div className="glass flex flex-col items-center rounded-2xl border border-white/15 px-6 py-10 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#e8c89b]/30 bg-[#e8c89b]/15">
            <Mic className="h-8 w-8 text-[#e8c89b]" aria-hidden="true" />
          </div>
          <p className="max-w-md text-sm text-white/70">
            Record your explanation in your own words. MindEcho transcribes the audio and leaves the text editable.
          </p>
          <button
            type="button"
            onClick={() => void startRecording()}
            aria-label="Start explaining"
            className="btn-glow mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8c89b]"
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            Start Explaining
          </button>
        </div>
      )}

      {phase === 'recording' && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-center">
          <div className="mb-4 flex items-center justify-center gap-2 text-sm font-semibold text-rose-200">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500 motion-safe:animate-pulse" aria-hidden="true" />
            Microphone is active
          </div>
          <canvas
            ref={canvasRef}
            width={480}
            height={72}
            className="mx-auto mb-4 h-16 w-full max-w-lg"
            aria-hidden="true"
          />
          <p className="font-mono text-3xl font-bold text-white" aria-label="Recording timer">
            {formatTime(elapsedSeconds)}
          </p>
          <p className="mt-1 text-xs text-white/50">Stops automatically at {formatTime(MAX_RECORDING_SECONDS)}.</p>
          <button
            type="button"
            onClick={finishRecording}
            aria-label="Stop recording"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-rose-600 px-6 py-3 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Square className="h-4 w-4 fill-white" aria-hidden="true" />
            Stop Recording
          </button>
        </div>
      )}

      {phase === 'transcribing' && (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-6" role="status">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#e8c89b]">
            <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            Transcribing your explanation...
          </div>
          <div className="space-y-3" aria-hidden="true">
            <GlassSkeleton className="h-3 w-full rounded-full" />
            <GlassSkeleton className="h-3 w-11/12 rounded-full" />
            <GlassSkeleton className="h-3 w-4/5 rounded-full" />
            <GlassSkeleton className="h-3 w-2/3 rounded-full" />
          </div>
          <p className="mt-4 text-xs text-white/55">Processing your audio</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/15 p-4 text-sm text-rose-100" role="alert">
          <p>{error.message}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 rounded-full border border-rose-200/40 px-4 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {error.retryable ? 'Retry transcription' : 'Try recording again'}
          </button>
        </div>
      )}

      {showTranscript && (
        <div className="space-y-4 rounded-2xl border border-emerald-400/20 bg-white/5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Transcription complete</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyTranscript()}
                aria-label="Copy transcript"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8c89b]"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {copied ? 'Copied' : 'Copy Transcript'}
              </button>
              <button
                type="button"
                onClick={() => void startRecording()}
                aria-label="Record again"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#e8c89b]/30 px-3 py-1.5 text-xs font-semibold text-[#e8c89b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8c89b]"
              >
                <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                Record Again
              </button>
              <button
                type="button"
                onClick={discardTranscript}
                aria-label="Discard transcript"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8c89b]"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Discard
              </button>
            </div>
          </div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#e8c89b]" htmlFor="explanation-transcript">
            Edit Transcript
          </label>
          <textarea
            id="explanation-transcript"
            value={transcript ?? ''}
            onChange={(event) => setTranscript(event.target.value)}
            rows={8}
            className="glass w-full rounded-2xl border border-white/15 px-4 py-3 text-sm text-white outline-none focus:border-[#e8c89b]"
          />
          {playbackUrl && (
            <audio src={playbackUrl} controls className="w-full" aria-label="Recording playback" />
          )}
        </div>
      )}

    </div>
  )
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function describeMicrophoneError(error: unknown): RecorderError {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      message: 'Microphone permission was denied. Allow microphone access in the browser and try again.',
      retryable: false,
    }
  }
  if (name === 'NotFoundError') {
    return { message: 'No microphone was found. Connect a microphone and try again.', retryable: false }
  }
  return { message: 'The microphone could not be started. Check the device and try again.', retryable: false }
}

function describeTranscriptionError(error: unknown): RecorderError {
  if (!(error instanceof ApiError)) {
    return { message: 'Transcription failed because of a network interruption. Try again.', retryable: true }
  }

  switch (error.code) {
    case 'UNAUTHORIZED':
    case 'INVALID_TOKEN':
    case 'SESSION_EXPIRED':
      return { message: 'Your session expired. Sign in again before transcribing.', retryable: false }
    case 'RATE_LIMIT_EXCEEDED':
      return { message: 'Too many transcription requests. Wait a moment, then retry.', retryable: true }
    case 'UNSUPPORTED_AUDIO':
    case 'INVALID_AUDIO':
      return { message: 'The recording format could not be read. Record again in this browser.', retryable: false }
    case 'EMPTY_AUDIO':
    case 'SILENT_AUDIO':
      return { message: error.message, retryable: false }
    case 'FILE_TOO_LARGE':
    case 'AUDIO_TOO_LONG':
      return { message: error.message, retryable: false }
    case 'TRANSCRIPTION_TIMEOUT':
    case 'NETWORK_ERROR':
      return { message: 'The connection was interrupted before transcription finished. Retry.', retryable: true }
    case 'TRANSCRIPTION_NOT_CONFIGURED':
      return { message: error.message, retryable: false }
    case 'TRANSCRIPTION_ROUTE_MISSING':
      return {
        message: error.message,
        retryable: false,
      }
    case 'TRANSCRIPTION_UNAVAILABLE':
      return { message: 'The transcription service is unavailable right now. Retry in a moment.', retryable: true }
    case 'UNEXPECTED_PROVIDER_RESPONSE':
      return { message: 'Transcription returned an unexpected response. Retry the same recording.', retryable: true }
    default:
      return { message: error.message || 'Transcription failed. Please try again.', retryable: true }
  }
}
