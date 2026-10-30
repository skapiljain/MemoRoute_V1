export const DEFAULT_MAX_AUDIO_BYTES = 24 * 1024 * 1024
export const MIN_AUDIO_BYTES = 32

export interface DetectedAudio {
  mimeType: string
  extension: string
}

const DECLARED_MIME_TO_CANONICAL: Record<string, string> = {
  'audio/webm': 'audio/webm',
  'audio/wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/mp4': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/ogg': 'audio/ogg',
  'audio/opus': 'audio/ogg',
  'audio/flac': 'audio/flac',
  'audio/x-flac': 'audio/flac',
}

export function canonicalAudioMime(declaredMimeType: string): string | null {
  const base = declaredMimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  return DECLARED_MIME_TO_CANONICAL[base] ?? null
}

export function detectAudioFormat(buffer: Buffer): DetectedAudio | null {
  if (buffer.length < 12) return null

  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { mimeType: 'audio/webm', extension: 'webm' }
  }

  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE') {
    return { mimeType: 'audio/wav', extension: 'wav' }
  }

  if (buffer.subarray(0, 4).toString('ascii') === 'OggS') {
    return { mimeType: 'audio/ogg', extension: 'ogg' }
  }

  if (buffer.subarray(0, 4).toString('ascii') === 'fLaC') {
    return { mimeType: 'audio/flac', extension: 'flac' }
  }

  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return { mimeType: 'audio/mp4', extension: 'm4a' }
  }

  if (buffer.subarray(0, 3).toString('ascii') === 'ID3' || isMp3Frame(buffer)) {
    return { mimeType: 'audio/mpeg', extension: 'mp3' }
  }

  return null
}

function isMp3Frame(buffer: Buffer): boolean {
  if (buffer.length < 2 || buffer[0] !== 0xff) return false
  const next = buffer[1] ?? 0
  return (next & 0xe0) === 0xe0 && (next & 0x06) !== 0
}

export interface ValidatedAudioFile extends DetectedAudio {
  sizeBytes: number
}

export function validateAudioFile(
  buffer: Buffer,
  declaredMimeType: string,
  maxBytes = DEFAULT_MAX_AUDIO_BYTES,
): ValidatedAudioFile {
  if (!buffer || buffer.length < MIN_AUDIO_BYTES) {
    throw new AudioValidationError('EMPTY_AUDIO', 'The recording is empty. Record again and speak before stopping.')
  }

  if (buffer.length > maxBytes) {
    throw new AudioValidationError('FILE_TOO_LARGE', 'The recording is larger than the upload limit. Record a shorter explanation.')
  }

  const declared = canonicalAudioMime(declaredMimeType)
  if (!declared) {
    throw new AudioValidationError(
      'UNSUPPORTED_AUDIO',
      'This audio format is not supported. Record in the browser and try again.',
    )
  }

  const detected = detectAudioFormat(buffer)
  if (!detected || detected.mimeType !== declared) {
    throw new AudioValidationError(
      'INVALID_AUDIO',
      'The uploaded file is not a valid audio recording.',
    )
  }

  return { ...detected, sizeBytes: buffer.length }
}

export class AudioValidationError extends Error {
  readonly code: 'EMPTY_AUDIO' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_AUDIO' | 'INVALID_AUDIO'

  constructor(code: AudioValidationError['code'], message: string) {
    super(message)
    this.name = 'AudioValidationError'
    this.code = code
  }
}
