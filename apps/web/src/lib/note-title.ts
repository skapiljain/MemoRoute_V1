const DEFAULT_NOTE_TITLE = 'Untitled Notion Note'

const PLACEHOLDER_TITLE_PATTERNS = [
  /^untitled notion note$/i,
  /^new concept notes?$/i,
  /^start typing your study notes here\.?\.?\.?$/i,
]

export function isDefaultNoteTitle(title: string | undefined | null): boolean {
  const trimmed = title?.trim() ?? ''
  return trimmed.length === 0 || trimmed === DEFAULT_NOTE_TITLE
}

export function isPlaceholderTitle(title: string | undefined | null): boolean {
  const trimmed = title?.trim() ?? ''
  if (!trimmed) return true
  return PLACEHOLDER_TITLE_PATTERNS.some((pattern) => pattern.test(trimmed))
}

export function normalizeReviewDate(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().split('T')[0]
}

export function deriveNoteTitle(content: string, fallback = DEFAULT_NOTE_TITLE): string {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+)$/)
    if (heading?.[1]) {
      const candidate = heading[1].trim()
      if (!isPlaceholderTitle(candidate)) {
        return candidate.slice(0, 200)
      }
      continue
    }

    const numbered = line.match(/^\d+\.\s+(.+)$/)
    if (numbered?.[1]) {
      const candidate = numbered[1].trim()
      if (!isPlaceholderTitle(candidate)) {
        return candidate.slice(0, 200)
      }
      continue
    }

    if (!isPlaceholderTitle(line)) {
      return line.slice(0, 200)
    }
  }

  return fallback
}

export function resolveNoteTitle(title: string, content: string): string {
  if (!isDefaultNoteTitle(title) && !isPlaceholderTitle(title)) {
    return title.trim()
  }

  const derived = deriveNoteTitle(content, '')
  if (derived && !isPlaceholderTitle(derived)) {
    return derived
  }

  return title.trim() || DEFAULT_NOTE_TITLE
}

export function getNoteDisplayTitle(note: { title: string; content: string }): string {
  return resolveNoteTitle(note.title, note.content)
}

export function getCalendarNoteLabel(note: {
  title: string
  content: string
  subject: string
  createdAt?: string
}): string {
  const title = getNoteDisplayTitle(note)

  if (!isPlaceholderTitle(title) && !isDefaultNoteTitle(note.title)) {
    return title
  }

  if (!isPlaceholderTitle(title) && title !== DEFAULT_NOTE_TITLE) {
    return title
  }

  if (note.subject?.trim()) {
    if (note.createdAt) {
      const created = normalizeReviewDate(note.createdAt)
      if (created) {
        return `${note.subject} (${created})`
      }
    }
    return note.subject
  }

  return title
}

export function noteMatchesReviewDate(
  note: { nextReviewDate?: string | null },
  dateStr: string,
): boolean {
  const reviewDate = normalizeReviewDate(note.nextReviewDate)
  return reviewDate === dateStr
}
