# Calendar on Student Home — UI Plan

## Purpose

Plan a compact calendar section on the signed-in student home. After login, the learner lands on `/student`; the calendar should appear lower on that page, after the primary “Today” review action. It should make upcoming tests and important days easy to notice, while showing scheduled revision days in a separate color. The calendar must stay visually quiet: dates carry small markers, and event details appear on hover, keyboard focus, or tap.

This is a planning document only. No application code was changed for this request.

## Branch and project context

- **Requested branch:** `calender` (spelling as requested).
- **Branch base:** `develop` at commit `d543078` (`Simplify student learning UI`), which matched `origin/develop` when the branch was created.
- **Current signed-in route:** `/student` renders `StudentDashboard` from `apps/web/src/pages/StudentFlow.tsx`.
- **Calendar route status:** `AdaptiveCalendar.tsx` exists, but it is not registered in `apps/web/src/App.tsx`. `/dashboard` redirects to `/student`.
- **Existing review data:** note review dates are available as `NoteItem.nextReviewDate` through `NotesContext`.
- **Existing event data:** `ImportantDateItem` has `title`, `date`, `subject`, `priority`, and optional `description`, and is exposed by `NotesContext`.
- **Existing persistence:** calendar settings and important dates already have API functions and local-storage fallback behavior in the notes context.

There is a pre-existing local deletion of `UI_SIMPLIFICATION_PLAN.md` in the working tree. It was left untouched; this calendar plan is a separate new file.

## Desired experience

1. After login, the learner lands on the student home as usual.
2. The first screen continues to prioritize today’s review or adding a topic.
3. Scrolling down reveals a compact “Upcoming” calendar section.
4. Each calendar date can show two independent markers:
   - **Revision marker:** a warm gold marker for one or more topics scheduled for review that day.
   - **Important-date marker:** a contrasting blue or violet marker for a test or other important date.
5. If both kinds of item fall on the same date, both markers are visible without stacking labels inside the cell.
6. Hovering over a marked date reveals a small, readable tooltip with the date and what is scheduled. Keyboard focus and tap should reveal the same information for accessibility and touch screens.

## Calendar layout

### Placement on `/student`

- Keep the greeting and “Today” review panel at the top of the page.
- Place the calendar below that primary content so it is available after scrolling, as requested.
- Give the section a short heading such as **Upcoming** and one brief explanatory line.
- Do not add analytics cards, a second dashboard, or a separate calendar mode selector to this area.

### Month grid

- Show one month at a time with simple previous/next month controls and a clear month/year label.
- Use a compact seven-column grid with legible date numbers and enough touch area on mobile.
- Keep each date cell visually neutral by default; use small dots or short color marks for scheduled items.
- Use a subtle outline or small neutral marker for today. Do not reuse either event color for the today state.
- Include a small, persistent legend with two entries: **Revision** and **Test / important date**.
- Avoid event names, emoji, priority badges, and multiple lines of text inside date cells.

### Date details

On hover or keyboard focus, show a compact tooltip anchored to the date. It should contain:

- The full date, including weekday.
- Test/important event title, subject, and optional short description when present.
- Revision topic titles and subject names for that date.
- A count when there are multiple items, with a short “and N more” line if the detail list would become long.

Keep the tooltip bounded to the viewport and readable against the page background. If a date has no event marker, do not show an empty tooltip.

For touch screens, tapping a date should open the same details in a small anchored popover or a compact details panel below the grid. Selecting a date must not navigate away or open a large modal.

## Color and marker rules

Use the existing restrained warm accent for revision markers and one distinct cool accent for tests/important dates. Confirm both colors against the current charcoal surface for contrast before implementation.

| Calendar state | Treatment |
|---|---|
| Ordinary date | Neutral date number; no badge or fill |
| Today | Thin neutral outline or small today indicator |
| Revision scheduled | One small warm-gold dot/marker |
| Test or important date | One small cool-color dot/marker |
| Both scheduled | Show both colored markers, each with an accessible label |
| Selected/focused | Visible neutral outline/ring that does not replace event colors |

Use event color plus text in the tooltip and legend; never rely on color alone to communicate meaning. Do not encode the event priority levels as additional calendar colors. Priority can appear in the details when useful.

## Handling tests and important dates

`ImportantDateItem` currently represents dates generically and does not include a category such as `test` or `important day`. Before implementation, decide how learners identify tests. Preferred approach: support a small event category (`test` or `important`) if the current create-date form and API can carry it without breaking existing records. If changing the data contract is out of scope, treat all saved important dates as the same “Test / important date” marker and display their existing title in details.

Do not silently infer event type from title text. Existing important dates without a category should continue to render as important dates.

## Data and month behavior

- Build revision markers from each note’s normalized `nextReviewDate`.
- Build important-date markers from `importantDates`.
- Normalize date-only and timestamp values to the same local calendar day before comparison.
- Keep month navigation local to the calendar section and update markers when the displayed month changes.
- Show only the currently visible month’s dates in the grid, while allowing the tooltip to list all items on a date.
- Avoid fetching separate copies of notes or important dates if `NotesContext` already provides them.

## States to design

- **Loading:** keep the section height stable with a restrained skeleton or short loading message.
- **No events this month:** show the ordinary calendar grid and a small note that no reviews or important dates are scheduled. Do not show a large empty-state card.
- **Several items on one date:** preserve only the two type markers; show all relevant items in the date details.
- **Data error:** keep the rest of the student page usable and show a concise calendar-specific error with a retry action if a retry mechanism is available.
- **No upcoming dates:** do not render blank marker rows or a fake event.

## Responsive and accessible behavior

- At desktop width, use a compact month grid that fits below the main student-home content without taking over the page.
- At mobile width, preserve the seven-day grid with smaller but tappable date targets; use tap-to-view details because hover is unavailable.
- Give previous/next controls clear accessible names and visible keyboard focus.
- Ensure calendar cells are keyboard reachable and announce their date plus marker types, for example: “Friday, October 9. Revision scheduled. Important date: Biology midterm.”
- Support Escape to dismiss an open popover and keep focus behavior predictable.
- Respect `prefers-reduced-motion`; avoid animated transitions that are needed to follow the calendar.
- Check tooltip/popover placement near screen edges and ensure it is not clipped by overflow containers.

## Suggested implementation sequence

1. **Confirm event semantics.** Decide whether tests need a distinct category or whether all existing important dates share one marker type.
2. **Confirm date normalization.** Reuse existing helpers where appropriate and ensure note dates and event dates match by local calendar day.
3. **Build the calendar section.** Add a focused component for month navigation, date grid, markers, legend, and date details; place it below the “Today” card on `/student`.
4. **Keep the main flow primary.** Do not move the calendar above the review action or add additional dashboard metrics around it.
5. **Add touch and keyboard details.** Implement hover/focus tooltip behavior and equivalent tap/keyboard popover behavior.
6. **Review states and responsive layout.** Check desktop and narrow mobile layouts, overlapping events, empty months, and loading/errors.
7. **Verify behavior.** Run the web build and relevant checks; exercise login-to-student navigation, month changes, marker color separation, and date details.

## Acceptance checklist

- [x] `calender` is based on the current `develop` tip.
- [x] After login, the learner remains on `/student` and can find the calendar by scrolling below the primary today/review content.
- [x] Revision dates and important/test dates use visibly different colors.
- [x] Dates containing both types show both markers without showing multiple event labels in the grid cell.
- [x] Hover and keyboard focus reveal the date’s contents.
- [x] Tapping a date provides the same details on touch screens.
- [x] Tooltip details include useful event titles and revision topic names without overwhelming the user.
- [x] The calendar stays compact and has a clear, small legend.
- [x] Empty, loading, error, and overlapping-event cases are handled. Calendar refresh failures show an inline retry action and do not block the rest of the student page.
- [x] The calendar is keyboard accessible and follows the global reduced-motion preference (no calendar-specific motion was added).
- [ ] Mobile layouts have been visually reviewed at device widths.

## Execution record

Implemented on `calender` from the recorded `develop` base. The calendar is placed below the primary student-home review content. Its date cells use small gold revision markers and blue test/important-date markers, with separate markers when both occur on one day. Hover and keyboard focus show details; selecting a date keeps details open for touch users. A collapsed-by-default “Add a date” form uses the existing important-date storage/API so learners can create upcoming events without opening the legacy full calendar. Refresh errors show a small retry message in the calendar section.

No event-category API change was made. Existing important dates share the blue marker and are labeled “Test / important date”; the configured exam target is separately identified as a test when it is upcoming.

Verification completed:

- `npm run build` — passed for the API and web workspaces.
- API suite — 16 files and 88 tests passed.
- Targeted Oxlint on `StudentCalendar.tsx` and `StudentFlow.tsx` — passed without warnings. `NotesContext.tsx` retains existing Fast Refresh and state-in-effect warnings.
- `git diff --check` — passed.
- Browser visual review could not run because the browser access host was unavailable. Responsive behavior is implemented in the layout classes but still needs a manual visual review at desktop and narrow mobile widths.

