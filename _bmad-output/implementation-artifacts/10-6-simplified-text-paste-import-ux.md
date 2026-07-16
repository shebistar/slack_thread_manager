# Story 10.6: Simplified Text-Paste Import UX

Status: review

## Story

As an **admin**,
I want the text-paste import to be a simple "paste and click" experience,
so that I can import Slack messages without hunting for hidden buttons or filling unnecessary fields.

## Acceptance Criteria

1. **Given** there is exactly one active channel configured, **When** the ImportForm renders, **Then** that channel is auto-selected and the channel dropdown is replaced by a read-only label showing the channel name.

2. **Given** there are multiple active channels, **When** the ImportForm renders, **Then** the first channel is selected by default in the dropdown and the user can change it.

3. **Given** the admin previously imported with a Slack Team ID, **When** the ImportForm renders on the next visit, **Then** the Team ID is pre-filled from localStorage and the field is collapsed into an "Advanced" section.

4. **Given** the Team ID field is empty (first use), **When** the ImportForm renders, **Then** the Team ID field is visible and prominently labeled with placeholder guidance.

5. **Given** the admin pastes Slack text into the textarea, **When** the parser detects messages, **Then** the submit button label updates to "Import N messages" showing the detected count.

6. **Given** the submit button is disabled (missing prerequisites), **When** the form renders, **Then** the button is always visually prominent (not faded to near-invisible) and inline validation text below it explains what is still needed.

7. **Given** the admin fills all required fields and pastes valid text, **When** they click the submit button, **Then** the import executes and on success the Team ID is persisted to localStorage for next time.

8. **Given** the admin completes a successful import, **When** results are displayed, **Then** the parse preview and result summary are clearly visible without scrolling past the textarea.

## Tasks / Subtasks

- [x] Task 1: Auto-select channel (AC: #1, #2)
  - [x] After `useChannels()` returns, if `activeChannels.length === 1`, auto-set `channelId` via `useEffect`.
  - [x] If `activeChannels.length > 1`, default to the first channel's id.
  - [x] When single channel: render a read-only badge instead of the dropdown.
  - [x] When multiple channels: keep the dropdown but with the first channel pre-selected.

- [x] Task 2: Team ID defaults and collapsible section (AC: #3, #4, #7)
  - [x] On mount, read `localStorage.getItem('stm-last-team-id')` and pre-fill `slackTeamId` state.
  - [x] On successful import, write `localStorage.setItem('stm-last-team-id', slackTeamId)`.
  - [x] When a saved Team ID exists: collapse the field into an inline display with a "Change" button to expand.
  - [x] When no saved Team ID exists: show the input field prominently.

- [x] Task 3: Prominent submit button with dynamic label (AC: #5, #6, #8)
  - [x] Move the submit button to appear directly after the paste textarea (inside TabsContent), not after the Tabs block.
  - [x] Dynamic button label: "Import N messages" when messages detected, "Import History" when no text pasted.
  - [x] When disabled: use a clearly visible disabled style (gray background, not near-invisible opacity-50 on red). The button must always be visible.
  - [x] Add inline validation helper text below the button listing missing prerequisites.

- [x] Task 4: Validation feedback messages (AC: #6)
  - [x] Below the button, render contextual helper messages for each missing prerequisite:
    - No channel selected: "Select a target channel above"
    - No Team ID: "Enter your Slack Team ID"
    - No text pasted: "Paste messages from Slack above"
  - [x] Messages disappear as prerequisites are satisfied.
  - [x] Use subtle but readable styling (`text-sm text-[--color-gray-50]`).

- [x] Task 5: Parse preview enhancement (AC: #5, #8)
  - [x] Show parse preview as a prominent inline alert/badge below the textarea: "N messages detected" with a check icon or success color.
  - [x] When zero messages parsed from non-empty text: show a warning message guiding the expected format.

- [x] Task 6: Tests (AC: all)
  - [x] Test auto-select: single channel auto-selects, multiple channels default to first.
  - [x] Test localStorage persistence: Team ID saved on import, pre-filled on re-render.
  - [x] Test button visibility: button is always in the DOM and visible regardless of form state.
  - [x] Test dynamic button label: "Import N messages" when text pasted, fallback otherwise.
  - [x] Test validation messages: correct messages shown/hidden based on form state.

- [x] Task 7: E2E validation (MANDATORY)
  - [x] TypeScript type-check passes.
  - [x] Full test suite green (existing + new tests).
  - [x] Production build succeeds.

## Dev Notes

### Story Scope and Intent

Story 10.6 is a **UX fix story** for the text-paste import form. The existing form technically works but has severe discoverability issues: the submit button is nearly invisible when disabled, and the form requires filling three fields before anything activates — with no guidance about what's missing. Users report "no button at all."

**What this story IS:**
- Making the submit button always visible and prominent
- Auto-selecting the channel when only one exists
- Remembering the Team ID across sessions via localStorage
- Adding inline validation feedback so users know what's needed
- Improving the parse preview to give immediate confidence

**What this story is NOT:**
- No backend/API changes
- No schema or migration changes
- No changes to the slack-text-parser logic
- No changes to the import mutation hook
- No new routes or pages

### Key File

All UI changes are in `apps/web/src/components/admin/import-form.tsx`. The hooks (`use-import.ts`, `use-channels.ts`) and parser (`slack-text-parser.ts`) are unchanged.

### Current Form Structure (pre-fix)

```
<form className="space-y-5 max-w-lg">
  1. Channel dropdown (or "No active channels" message)
  2. Slack Team ID input
  3. <Tabs> component (Paste Text / Upload JSON)
     - TabsContent "paste": 12-row textarea + parse preview
     - TabsContent "file": file input
  4. Submit button ("Import History") — AFTER Tabs, disabled until all 3 fields filled
</form>
```

Problems:
- Button at position 4 is below a 12-row textarea, often below viewport fold
- `disabled:opacity-50` on `bg-[--color-brand-red]` ≈ faded pink, nearly invisible on white
- No validation messages — user doesn't know why nothing happens
- Channel and Team ID must be manually filled every time

### Design System Tokens

Use existing project tokens:
- `bg-[--color-brand-red]` for enabled primary button
- `text-[--color-gray-50]` for helper/validation text
- `text-[--color-gray-95]` for primary text
- `bg-[--color-gray-20]` for disabled button background
- `text-[--color-gray-50]` for disabled button text

### References

- [Source: apps/web/src/components/admin/import-form.tsx] — Current form implementation
- [Source: _bmad-output/planning-artifacts/epics.md#Text-Paste-Import] — "Text-paste import is a primary ingestion mode"
- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.7] — Channel configuration (provides channel data)

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.5

### Debug Log References

- `pnpm --filter @slack-thread-manager/web exec vitest run src/components/admin/import-form.test.tsx` — 11/11 passed
- `pnpm --filter @slack-thread-manager/web exec tsc --noEmit` — clean
- `pnpm test` — full suite green (web: 301 tests / 29 files including new ImportForm tests)
- `pnpm --filter @slack-thread-manager/web build` — production build succeeded

### Completion Notes List

- Auto-selects first active channel; single-channel installs show a read-only badge instead of a dropdown.
- Team ID is read/written via `localStorage` key `stm-last-team-id`; saved values render collapsed with a Change control.
- Submit button lives inside each TabsContent (directly under paste/file controls) with dynamic "Import N messages" labeling.
- Disabled state uses gray background + `disabled:opacity-100` so the button stays visually discoverable; contextual validation lines list missing prerequisites.
- Parse preview uses a green success banner when messages are detected and a yellow warning when paste text yields zero messages.
- Unit coverage added in `import-form.test.tsx` for auto-select, localStorage, button visibility/label, and validation messaging.
- OpenShift/manual browser E2E against a live admin session was not run in this session; UI unit coverage + build gates were verified. Manual paste check remains recommended on the cluster (Admin → Import).

### File List

- `apps/web/src/components/admin/import-form.tsx`
- `apps/web/src/components/admin/import-form.test.tsx`
- `_bmad-output/implementation-artifacts/10-6-simplified-text-paste-import-ux.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-07-16: Implemented simplified ImportForm UX (auto-channel, Team ID persistence, prominent submit + validation, parse preview). Status → review.
