import { ApiError } from './api-error.js'

type AudioExtension = 'webm' | 'wav' | 'mp4' | 'ogg' | 'mp3' | 'm4a'

const MIME_TO_EXTENSION: Record<string, AudioExtension> = {
  'audio/webm': 'webm',
  webm: 'webm',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  wav: 'wav',
  'x-wav': 'wav',
  wave: 'wav',
  'audio/mp4': 'mp4',
  mp4: 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'x-m4a': 'm4a',
  m4a: 'm4a',
  'audio/ogg': 'ogg',
  ogg: 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  mpeg: 'mp3',
  mp3: 'mp3',
}

const EXTENSION_TO_MIME: Record<string, string> = {
  webm: 'audio/webm',
  wav: 'audio/wav',
  mp4: 'audio/mp4',
  m4a: 'audio/m4a',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
}

/**
 * Lowercase and strip ";codecs=..." parameters from a MIME type.
 */
export function normalizeAudioMime(mime: string): string {
  return mime.split(';')[0]!.trim().toLowerCase()
}

/**
 * Map a MIME type (with or without codecs parameters) to a file extension.
 * Throws ApiError 415 for unsupported types.
 */
export function audioExtensionForMime(mime: string): AudioExtension {
  const normalized = normalizeAudioMime(mime)
  const ext = MIME_TO_EXTENSION[normalized]

  if (!ext) {
    throw new ApiError(
      415,
      'UNSUPPORTED_AUDIO_FORMAT',
      `Unsupported audio format: ${normalized}`,
    )
  }

  return ext
}

/**
 * Return the canonical MIME type for a file extension.
 */
export function mimeForExtension(extension: string): string {
  return EXTENSION_TO_MIME[extension] ?? 'application/octet-stream'
}
