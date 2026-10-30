export const MAX_RECORDING_SECONDS = 600
export const MAX_AUDIO_BYTES = 24 * 1024 * 1024

const RECORDING_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
]

export function selectRecordingMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return null
  }

  return RECORDING_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

export function extensionForRecordingMime(mimeType: string): string {
  const base = mimeType.split(';')[0]?.toLowerCase() ?? ''
  if (base.includes('mp4') || base.includes('m4a')) return 'm4a'
  if (base.includes('ogg') || base.includes('opus')) return 'ogg'
  if (base.includes('wav')) return 'wav'
  if (base.includes('mpeg') || base.includes('mp3')) return 'mp3'
  return 'webm'
}
