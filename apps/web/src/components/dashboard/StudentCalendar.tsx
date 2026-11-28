import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import type { ImportantDateItem, NoteItem, StudyModeType } from '../../context/NotesContext'
import { getCalendarNoteLabel } from '../../lib/note-title'

interface ExamMarker {
  title: string
}

interface DateItems {
  revisions: NoteItem[]
  importantDates: ImportantDateItem[]
  exams: ExamMarker[]
}

interface StudentCalendarProps {
  notes: NoteItem[]
  importantDates: ImportantDateItem[]
  studyMode: StudyModeType
  examTargetDate: string
  examTitle: string
  isLoading: boolean
  refreshError: string | null
  onRetry: () => Promise<void>
  addImportantDate: (item: Omit<ImportantDateItem, 'id'>) => Promise<void>
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateKey(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : localDateKey(parsed)
}

function formatDate(key: string, options: Intl.DateTimeFormatOptions): string {
  const [year, month, day] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en', options).format(new Date(year, month - 1, day))
}

function emptyDateItems(): DateItems {
  return { revisions: [], importantDates: [], exams: [] }
}

function DateItemsList({ items, compact = false }: { items: DateItems; compact?: boolean }) {
  const revisions = items.revisions.slice(0, compact ? 2 : 4)
  const importantDates = items.importantDates.slice(0, compact ? 2 : 4)
  const exams = items.exams.slice(0, compact ? 1 : 2)
  const hiddenCount = Math.max(0, items.revisions.length - revisions.length)
    + Math.max(0, items.importantDates.length - importantDates.length)
    + Math.max(0, items.exams.length - exams.length)

  return (
    <div className={compact ? 'space-y-2' : 'grid gap-3 sm:grid-cols-2'}>
      {exams.map((exam, index) => (
        <div key={`exam-${exam.title}-${index}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-300">Test</p>
          <p className="mt-0.5 truncate text-xs font-medium text-white">{exam.title}</p>
        </div>
      ))}
      {importantDates.map((item) => (
        <div key={item.id}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-300">Test / important date</p>
          <p className="mt-0.5 truncate text-xs font-medium text-white">{item.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-white/50">{item.subject}{item.priority === 'high' ? ' · High priority' : ''}</p>
          {item.description && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-white/55">{item.description}</p>}
        </div>
      ))}
      {revisions.map((note) => (
        <div key={note.id}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#e8c89b]">Revision</p>
          <p className="mt-0.5 truncate text-xs font-medium text-white">{getCalendarNoteLabel(note)}</p>
          <p className="mt-0.5 truncate text-[11px] text-white/50">{note.subject}</p>
        </div>
      ))}
      {hiddenCount > 0 && <p className="text-[11px] text-white/45">And {hiddenCount} more</p>}
    </div>
  )
}

export function StudentCalendar({
  notes,
  importantDates,
  studyMode,
  examTargetDate,
  examTitle,
  isLoading,
  refreshError,
  onRetry,
  addImportantDate,
}: StudentCalendarProps) {
  const [month, setMonth] = useState(() => {
    const current = new Date()
    return new Date(current.getFullYear(), current.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const todayKey = localDateKey(new Date())
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDate, setNewDate] = useState(todayKey)
  const [newSubject, setNewSubject] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPriority, setNewPriority] = useState<ImportantDateItem['priority']>('medium')
  const [savingDate, setSavingDate] = useState(false)
  const [dateError, setDateError] = useState('')
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const monthName = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(month)
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()

  const dateItems = useMemo(() => {
    const itemsByDate = new Map<string, DateItems>()
    const getItems = (key: string) => {
      const existing = itemsByDate.get(key)
      if (existing) return existing
      const created = emptyDateItems()
      itemsByDate.set(key, created)
      return created
    }

    for (const note of notes) {
      const key = dateKey(note.nextReviewDate)
      if (key && key >= todayKey) getItems(key).revisions.push(note)
    }

    for (const item of importantDates) {
      const key = dateKey(item.date)
      if (key && key >= todayKey) getItems(key).importantDates.push(item)
    }

    const examKey = dateKey(examTargetDate)
    if (studyMode === 'exam' && examKey && examKey >= todayKey && examTitle.trim()) {
      const sameImportantDateExists = importantDates.some(
        (item) => dateKey(item.date) === examKey && item.title.trim().toLowerCase() === examTitle.trim().toLowerCase(),
      )
      if (!sameImportantDateExists) getItems(examKey).exams.push({ title: examTitle.trim() })
    }

    return itemsByDate
  }, [notes, importantDates, studyMode, examTargetDate, examTitle, todayKey])

  let monthEventsCount = 0
  for (let day = 1; day <= daysInMonth; day += 1) {
    const items = dateItems.get(localDateKey(new Date(year, monthIndex, day)))
    if (items && (items.revisions.length || items.importantDates.length || items.exams.length)) monthEventsCount += 1
  }

  const selectedItems = selectedDate ? dateItems.get(selectedDate) : undefined
  const selectedHasItems = Boolean(selectedItems && (selectedItems.revisions.length || selectedItems.importantDates.length || selectedItems.exams.length))

  const changeMonth = (offset: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
    setSelectedDate(null)
    setHoveredDate(null)
  }

  const toggleDate = (key: string) => {
    setSelectedDate((current) => current === key ? null : key)
  }

  const handleAddDate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newTitle.trim() || !newDate) return
    setSavingDate(true)
    setDateError('')
    try {
      await addImportantDate({
        title: newTitle.trim(),
        date: newDate,
        subject: newSubject.trim() || 'General',
        priority: newPriority,
        description: newDescription.trim() || undefined,
      })
      const targetMonth = new Date(`${newDate}T00:00:00`)
      setMonth(new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1))
      setSelectedDate(newDate)
      setNewTitle('')
      setNewSubject('')
      setNewDescription('')
      setNewPriority('medium')
      setShowAddForm(false)
    } catch (caught) {
      setDateError(caught instanceof Error ? caught.message : 'Could not save this date.')
    } finally {
      setSavingDate(false)
    }
  }

  return (
    <section className="mt-10" aria-labelledby="upcoming-calendar-title">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[#e8c89b]"><CalendarDays className="h-4 w-4" /><p className="text-sm font-medium">Plan ahead</p></div>
          <h2 id="upcoming-calendar-title" className="mt-1 text-xl font-semibold text-white">Upcoming calendar</h2>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-white/55" aria-label="Calendar legend">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#e8c89b]" />Revision</span>
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-300" />Test or important date</span>
          </div>
          <button type="button" onClick={() => setShowAddForm((current) => !current)} aria-expanded={showAddForm} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-xs font-medium text-white/65 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e8c89b]">
            <Plus className="h-3.5 w-3.5" /> Add a date
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
        {showAddForm && (
          <form onSubmit={(event) => void handleAddDate(event)} className="mb-5 rounded-lg border border-white/10 bg-black/10 p-4" aria-label="Add a test or important date">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Add a test or important date</h3>
              <button type="button" onClick={() => { setShowAddForm(false); setDateError('') }} className="rounded-md px-2 py-1 text-xs text-white/45 hover:bg-white/5 hover:text-white">Cancel</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs text-white/60">Title</span><input required maxLength={120} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="e.g. Biology midterm" className="w-full rounded-md border border-white/10 bg-[#151719] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#e8c89b]/60 focus-visible:ring-2 focus-visible:ring-[#e8c89b]/20" /></label>
              <label className="block"><span className="mb-1.5 block text-xs text-white/60">Date</span><input required min={todayKey} type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} className="w-full rounded-md border border-white/10 bg-[#151719] px-3 py-2.5 text-sm text-white outline-none focus:border-[#e8c89b]/60 focus-visible:ring-2 focus-visible:ring-[#e8c89b]/20" /></label>
              <label className="block"><span className="mb-1.5 block text-xs text-white/60">Subject</span><input value={newSubject} onChange={(event) => setNewSubject(event.target.value)} placeholder="Optional" className="w-full rounded-md border border-white/10 bg-[#151719] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#e8c89b]/60 focus-visible:ring-2 focus-visible:ring-[#e8c89b]/20" /></label>
              <label className="block"><span className="mb-1.5 block text-xs text-white/60">Priority</span><select value={newPriority} onChange={(event) => setNewPriority(event.target.value as ImportantDateItem['priority'])} className="w-full rounded-md border border-white/10 bg-[#151719] px-3 py-2.5 text-sm text-white outline-none focus:border-[#e8c89b]/60 focus-visible:ring-2 focus-visible:ring-[#e8c89b]/20"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
              <label className="block"><span className="mb-1.5 block text-xs text-white/60">Short note <span className="text-white/35">(optional)</span></span><input value={newDescription} onChange={(event) => setNewDescription(event.target.value)} placeholder="Room, chapters, or reminder" className="w-full rounded-md border border-white/10 bg-[#151719] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#e8c89b]/60 focus-visible:ring-2 focus-visible:ring-[#e8c89b]/20" /></label>
            </div>
            {dateError && <p className="mt-3 text-xs text-rose-300" role="alert">{dateError}</p>}
            <button type="submit" disabled={savingDate} className="mt-4 rounded-md bg-[#e8c89b] px-4 py-2.5 text-xs font-semibold text-[#211b18] transition hover:bg-[#f0d8b6] disabled:cursor-not-allowed disabled:opacity-60">{savingDate ? 'Saving…' : 'Save date'}</button>
          </form>
        )}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{monthName}</h3>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)} className="rounded-md p-2 text-white/60 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e8c89b]"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="Next month" onClick={() => changeMonth(1)} className="rounded-md p-2 text-white/60 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e8c89b]"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

        {isLoading ? (
          <p className="flex min-h-40 items-center justify-center text-sm text-white/45" role="status">Loading your calendar…</p>
        ) : (
          <>
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-white/40 sm:gap-2 sm:text-xs" aria-hidden="true">
              {WEEKDAYS.map((day) => <span key={day} className="py-1">{day}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-2" role="group" aria-label={`${monthName} dates`}>
              {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
              {Array.from({ length: daysInMonth }, (_, index) => {
                const day = index + 1
                const key = localDateKey(new Date(year, monthIndex, day))
                const items = dateItems.get(key) ?? emptyDateItems()
                const hasRevisions = items.revisions.length > 0
                const hasImportantDates = items.importantDates.length > 0 || items.exams.length > 0
                const hasItems = hasRevisions || hasImportantDates
                const isToday = key === todayKey
                const isSelected = key === selectedDate
                const isTooltipVisible = key === hoveredDate && hasItems
                const weekdayDate = formatDate(key, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                const description = [
                  hasRevisions ? `${items.revisions.length} ${items.revisions.length === 1 ? 'revision' : 'revisions'}` : '',
                  ...items.exams.map((exam) => `Test: ${exam.title}`),
                  ...items.importantDates.map((item) => `Important date: ${item.title}`),
                ].filter(Boolean).join('. ')
                const tooltipId = `calendar-date-${key}`
                const column = (firstWeekday + index) % 7
                const row = Math.floor((firstWeekday + index) / 7)
                const lastRow = Math.floor((firstWeekday + daysInMonth - 1) / 7)
                const tooltipPosition = row === lastRow ? 'bottom-full mb-2' : 'top-full mt-2'
                const tooltipAlignment = column >= 5 ? 'right-0' : 'left-0'

                return (
                  <div key={key} className={`relative ${isTooltipVisible ? 'z-30' : ''}`}>
                  <button
                    type="button"
                    aria-label={`${weekdayDate}${description ? `. ${description}` : '. No items scheduled.'}`}
                    aria-pressed={isSelected}
                    aria-describedby={isTooltipVisible ? tooltipId : undefined}
                    onClick={() => toggleDate(key)}
                    onMouseEnter={() => setHoveredDate(key)}
                    onMouseLeave={() => setHoveredDate((current) => current === key ? null : current)}
                    onFocus={() => setHoveredDate(key)}
                    onBlur={() => setHoveredDate(null)}
                    onKeyDown={(event) => { if (event.key === 'Escape') setSelectedDate(null) }}
                    className={`flex min-h-10 w-full flex-col items-center justify-center gap-1 rounded-md border text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e8c89b] sm:min-h-11 ${
                      isSelected ? 'border-white/45 bg-white/[0.06] text-white' : isToday ? 'border-white/25 bg-white/[0.035] text-white' : 'border-transparent text-white/70 hover:border-white/15 hover:bg-white/[0.035]'
                    }`}
                  >
                    <span className="leading-none">{day}</span>
                    <span className="flex h-2 items-center gap-1" aria-hidden="true">
                      {hasRevisions && <span className="h-1.5 w-1.5 rounded-full bg-[#e8c89b]" />}
                      {hasImportantDates && <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />}
                      {isToday && <span className="h-1 w-1 rounded-full bg-white/75" />}
                    </span>
                  </button>
                    {isTooltipVisible && (
                      <div id={tooltipId} role="tooltip" className={`pointer-events-none absolute ${tooltipPosition} ${tooltipAlignment} z-40 w-56 rounded-lg border border-white/15 bg-[#202326] p-3 text-left shadow-xl`}>
                        <p className="mb-2 text-xs font-semibold text-white">{formatDate(key, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                        <DateItemsList items={items} compact />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {refreshError && (
              <div className="mt-4 flex flex-col gap-2 rounded-md border border-rose-300/15 bg-rose-300/[0.04] px-3 py-3 sm:flex-row sm:items-center sm:justify-between" role="alert">
                <p className="text-xs text-rose-100/80">Could not refresh your study dates. You can retry without leaving this page.</p>
                <button type="button" onClick={() => void onRetry()} disabled={isLoading} className="w-fit rounded-md border border-rose-200/20 px-3 py-1.5 text-xs font-medium text-rose-100 transition hover:bg-rose-200/10 disabled:opacity-50">{isLoading ? 'Retrying…' : 'Retry'}</button>
              </div>
            )}
            {!refreshError && monthEventsCount === 0 && <p className="mt-4 text-xs text-white/40">No revisions or important dates scheduled this month.</p>}
            {selectedDate && (
              <div className="mt-4 rounded-lg border border-white/10 bg-black/10 p-4" aria-live="polite">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Selected date</p>
                    <p className="mt-1 text-sm font-medium text-white">{formatDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedDate(null)} className="rounded-md px-2 py-1 text-xs text-white/45 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e8c89b]">Close</button>
                </div>
                {selectedHasItems && selectedItems ? <DateItemsList items={selectedItems} /> : <p className="text-xs text-white/45">Nothing scheduled for this date.</p>}
              </div>
            )}
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-white/40">Hover or focus a marked day for details. Select a date to keep its details open.</p>
    </section>
  )
}
