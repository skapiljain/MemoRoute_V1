## Purpose

This document records the UI simplification plan and the implementation completed against it. It does not prescribe backend changes or change learning behavior by itself.

## Source of truth

- **UI review branch:** `develop` (the latest updated branch identified for this project).
- **Review note:** The UI review first inspected `develop` from a `cleaning-dir` checkout. The implementation is now on `develop`.
- **Frontend entry point:** `apps/web/src/App.tsx`.
- **Main current student flow:** `apps/web/src/pages/StudentFlow.tsx`.
- **Public landing page composition:** `apps/web/src/pages/Home.tsx` and the components it assembles.
- **Global visual tokens and effects:** `apps/web/src/index.css`.
- **Product and route documentation:** `PRODUCT.md`.

If work resumes later, confirm whether `develop` has moved since this implementation. Keep this file as the working plan and update it if the product direction or route structure changes.

## Execution record — 2026-11-28

Implemented on `develop`:

- Replaced the long landing page section stack with a focused product message, three-step learning loop, and clear start action.
- Simplified public and student navigation to real, currently registered routes; removed the active theme switcher and reduced glass, blur, glow, gradient, and hover effects.
- Made `/student` the clear home for due reviews, with review or add-topic as the primary action and streak metrics secondary.
- Changed the revisions page to show only topics that are actually due rather than silently listing every saved topic when the queue is clear.
- Made file upload optional and collapsed on the add-topic form; simplified practice to one focused question and response area.
- Updated `PRODUCT.md` to document the active routes and identify legacy page components that are not currently routed.
- Kept unregistered legacy pages and analytics widgets in the source tree because their future product status has not been confirmed.

Verification:

- `npm run build` — passed for API and web workspaces.
- `npm test --workspace=@lector/api` — passed, 16 files and 88 tests.
- `npm run lint --workspace=@lector/web` — passed with pre-existing warnings elsewhere in the codebase.
- Targeted Oxlint on the edited UI components — passed with no warnings.
- `git diff --check` — passed.

Responsive behavior was reviewed from the responsive layout classes but was not visually exercised in a browser at multiple viewport sizes.

## Current UI assessment

### Visual style

The current interface uses a dark mocha background and warm gold accents, alongside glass surfaces, blur, gradients, glows, animated elements, and rounded cards. Those elements are applied broadly, so many parts of the screen compete for attention. The result feels more decorative than focused, especially for a product people may use for regular study sessions.

Several visual conventions are also mixed together: theme tokens coexist with hard-coded colors, page-specific styles, and legacy classes. This makes a consistent look harder to maintain and makes future refinements more expensive.

### Public landing page

The home page currently assembles a long sequence of sections: hero, feature bar, problem, services, how it works, why us, about/team, blog/research, contact, and footer. Multiple sections make similar claims about the product and repeat card-heavy layouts. The page asks visitors to process a lot before they reach a clear next step.

### Student experience and information hierarchy

The active `/student` page is a distinct student-focused dashboard. It presents streak and study-day metrics, two large actions, and an upcoming calendar. These are all useful, but their current presentation gives several elements similar visual weight. The most important next action should be more obvious.

Revision, topic creation, and practice pages use a similar dark card treatment. Topic creation presents text entry and file upload side by side, even though a learner may only need to enter a title and subject to continue. The practice page includes a secondary reminder panel that can compete with the question and response controls.

### Competing dashboard and documentation paths

`/dashboard` redirects to `/student`, while a separate `Dashboard.tsx` and dashboard analytics components exist. That older dashboard has a different interaction model, including a draggable widget grid and evaluation history. The project should choose one canonical student home and decide which analytics deserve a separate destination.

`PRODUCT.md` documents routes and features such as `/subjects`, `/concept/new`, `/calendar`, and `/payment`, while the current `App.tsx` route table wires a smaller student flow (`/student`, `/revisions`, `/topics/new`, and `/practice/:noteId`) plus login. Keep the product document aligned with the actual interface and routing decisions.

## Design direction

Build a calm, clear study workspace that feels dependable and easy to scan. Prefer a neutral surface, readable text, restrained use of one accent color, consistent spacing, and simple borders. Use elevation and cards only when they clarify grouping or interaction. Keep animation subtle and purposeful.

This is a proposed direction, not a final brand decision. During implementation, preserve the MemoRoute identity while reducing decorative styling and visual noise. Do not add a second theme unless there is a clear user need for it.

### Principles

1. **One primary action per screen.** Make the next useful step visually obvious.
2. **Clear hierarchy.** Page title, short context, primary content, and secondary details should have distinct emphasis.
3. **Fewer containers.** Use whitespace and typography before adding another card or border.
4. **Consistent components.** Reuse a small set of buttons, inputs, navigation, cards, badges, and page headers.
5. **Progressive disclosure.** Keep optional tasks such as attaching material or viewing advanced analytics out of the main path until needed.
6. **Accessible by default.** Maintain readable contrast, visible keyboard focus, usable touch targets, and reduced-motion support.

## Target information architecture

Use the existing student flow as the starting point and confirm its page map before implementation:

- **Home / landing:** Explain the product simply and lead to getting started or signing in.
- **Student home:** Show what needs attention now, then provide a clear way to add a topic.
- **Revisions:** List topics ready to review, grouped or filterable in a way that is easy to scan.
- **Add topic:** Capture the minimum information needed to start. Keep notes and uploads optional.
- **Practice:** Focus on recalling one topic and submitting a text or voice response.
- **Progress (optional):** A separate destination for trends and evaluation history, if these analytics are important enough to keep.

Avoid presenting an analytics dashboard, student home, and multiple entry routes as competing versions of the same destination.

## Implementation sequence

### Phase 0 — Confirm branch and scope

- Start from `develop`, the branch identified as the latest updated source for this review.
- Check current route wiring, active pages, and whether `PRODUCT.md` has changed.
- Decide whether the interface should remain dark or move to a light/neutral default. The recommendation is to test a neutral, low-contrast surface with a single restrained accent, while retaining adequate text contrast.
- Confirm whether streak metrics, calendar, draggable widgets, evaluation history, and theme switching are core or secondary features.

**Deliverable:** A short, agreed page map and a clear list of features retained in the main navigation.

### Phase 1 — Establish the design system

- Consolidate color, typography, spacing, radius, border, shadow, focus, and motion values into shared tokens.
- Replace repeated hard-coded mocha/gold values with tokens where practical.
- Choose a limited palette: page background, content surface, primary text, secondary text, border, one accent, and semantic success/warning/error colors.
- Standardize heading sizes, body sizes, line lengths, control heights, and common layout widths.
- Reduce or remove global glass, glow, blur, and hover-lift effects when they do not communicate state or affordance.
- Ensure shared controls have consistent default, hover, focus, disabled, loading, and error styles.
- Keep reduced-motion behavior available and avoid adding animation as a requirement for understanding the UI.

**Deliverable:** Shared tokens and component conventions that can be applied to every page without inventing page-specific treatments.

### Phase 2 — Simplify the landing page

Reduce the long section sequence to a compact narrative:

1. **Hero:** State who MemoRoute helps and what it does in plain language. Use one primary call to action and one secondary link only if needed.
2. **How it works:** Explain the core learning loop in three clear steps (add a topic, recall it, review at the right time).
3. **Core capabilities:** Show only the features that directly support that loop. Use concise copy and avoid repeating the hero promise.
4. **Credibility:** Include one focused trust element, such as evidence, a learner quote, or a concise team/research reference. Avoid multiple full-page proof sections.
5. **Closing action and footer:** Repeat the primary next step and keep navigation links compact.

Review the existing problem, services, why-us, team, blog/research, and contact content. Keep only content that answers an important visitor question or increases confidence. Move secondary material to a compact link or separate route instead of giving every section equal weight.

**Deliverable:** A shorter page with a clear message, a clear path to start, and a consistent visual rhythm.

### Phase 3 — Make one canonical student home

- Keep `/student` as the starting point unless route review identifies a better existing destination.
- Remove the ambiguity between `Dashboard.tsx` and `StudentDashboard` by deciding which dashboard components are active and which are obsolete.
- Put the most timely task first: due reviews, or a clear empty state that invites the learner to add a topic.
- Make “Review today” the primary action when topics are due; make “Add a topic” the main action when no review is due.
- Keep streak and total study days compact and secondary. Do not give two metric cards the same prominence as the main task.
- Decide whether the upcoming calendar belongs on the home screen. If retained, show a compact upcoming list and link to a full calendar only if that route exists and is maintained.
- Decide whether evaluation history and detailed retention analytics belong on a separate Progress page.
- Simplify the header to the brand, a small number of destinations, and a compact account menu/sign-out action. Show theme switching only if multiple themes remain supported.

**Deliverable:** One student home with an obvious next step and no duplicate dashboard model.

### Phase 4 — Simplify the learning flow

#### Revisions

- Prioritize overdue and due topics, with subject and topic titles easy to scan.
- Use a compact row/list as the default where it improves scanning; use cards only when they add useful grouping.
- Make due status and the “Practice” action unambiguous.
- Provide a plain empty state with one action to add the first topic.

#### Add a topic

- Make topic title and subject the first, required inputs.
- Keep note text optional and visually secondary.
- Present upload as an optional alternative or expandable section, not as a competing large panel beside the main form.
- Explain supported file types and what happens after upload near the control.
- Keep validation, saving, success, and error feedback clear and close to the relevant action.

#### Practice

- Keep topic context, question, response control, and submit action as the main content.
- Make text and voice modes a clear, consistent switch.
- Keep recording status and permission/error feedback visible and specific.
- Move coaching reminders into brief inline guidance or a collapsible help area.
- After submission, present the result and one clear next step (continue reviewing or return home).

**Deliverable:** A small number of screens that keep learners focused on adding, recalling, and reviewing material.

### Phase 5 — Consolidate components and routes

- Create/reuse shared page shell, navigation, page heading, button, input, textarea, card/list row, badge, empty state, and loading state patterns.
- Remove unused or superseded visual components only after route and import checks confirm they are no longer needed.
- Review navigation destinations against the actual route table; remove stale links and update redirects deliberately.
- Align `PRODUCT.md` and any route documentation with the chosen page map and shipped behaviors.
- Avoid mixing two separate component systems or maintaining legacy style remapping when the corresponding legacy UI has been removed.

**Deliverable:** A coherent, maintainable UI foundation with accurate route documentation.

### Phase 6 — Responsive and accessibility review

Review each retained page at narrow mobile, tablet, and desktop widths. Confirm:

- Navigation works on small screens and does not obscure content.
- Forms and actions are comfortable to use by touch and keyboard.
- Text contrast and text sizing remain readable.
- Focus state is visible and follows a logical order.
- Icon-only controls have accessible names.
- Loading, empty, error, disabled, and success states are designed, not incidental.
- Reduced-motion preferences are respected.
- Long titles, large text, and missing data do not break the layout.

**Deliverable:** A consistent experience across viewport sizes and interaction modes.

## Suggested prioritization

| Priority | Work                                        | Why                                                                             |
| -------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| 1        | Confirm routes and canonical dashboard      | Prevents polishing the wrong screens or maintaining duplicate home experiences. |
| 2        | Define tokens and shared components         | Makes the visual simplification consistent and faster to apply.                 |
| 3        | Simplify the student home and learning flow | Improves the core recurring product experience.                                 |
| 4        | Condense the landing page                   | Makes the first impression clearer and reduces repeated messaging.              |
| 5        | Align docs and remove unused UI             | Reduces confusion and future maintenance burden.                                |
| 6        | Responsive and accessibility pass           | Ensures simplification works for all learners and devices.                      |

## Review checklist for the implementation

- [x] `develop` is still the intended base branch.
- [x] There is one clear canonical student home.
- [x] The page map matches actual routes and navigation links.
- [x] The landing page communicates the product without repeating the same pitch in multiple sections.
- [x] Each student page has one obvious primary action.
- [x] Optional file upload is secondary and progressively disclosed.
- [x] The active UI uses a restrained palette and simpler shared surface treatment.
- [x] Decorative effects no longer dominate the active experience.
- [x] Existing empty, loading, error, and success states are retained in the learning flow.
- [ ] Mobile layouts have been visually reviewed at device widths.
- [x] Keyboard focus is visible on the updated navigation and primary actions; reduced motion remains supported globally.
- [x] `PRODUCT.md` reflects the implemented routes and capabilities.

## Out of scope for this UI plan

- Backend/API behavior or database changes.
- Changing learning algorithms, evaluation scoring, or spaced-repetition rules.
- Removing product capabilities before confirming whether they are still needed.
- Rebranding MemoRoute or changing product naming.
