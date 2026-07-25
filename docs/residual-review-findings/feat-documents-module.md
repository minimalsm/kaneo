# Residual Review Findings — feat/documents-module

## Cross-project Tasks view — run `20260725-144228-cf1bb942`

Verdict: Ready with fixes. Four validated findings applied (date-param validation, sheet resilience incl. deep-link cleanup + placeholderData, page-append dedupe, exact week-bounds tests). Bonus fixes this run: a pre-existing upstream API bug (`GET /search` 400'd whenever `limit` was omitted — numeric default fed to a string pipe) and Phase 1's search integration tests corrected to send the required `workspaceId`. **The full integration suite (14 files / 117 tests, all phases) now executes locally against Postgres and passes — first complete run.** Remaining advisories:

- P3 — priority sort lists urgent last (asc weight); a per-key default direction or a client sort-direction control would fix it (client `sortOrder` plumbing was deliberately dropped until a UI exists).
- P3 — well-typed-but-stale localStorage filter values (e.g. removed member id) survive normalization and can pin an empty list until filters are touched; vocabulary validation suggested.
- Residual notes: COUNT re-runs per load-more page (accepted; drift between total and rows while paging is possible); one-frame stale-filters query on workspace switch (self-corrects).
- Browser smoke passed: two projects seeded, "assigned to me" default shows both my tasks under correct project headers, hides unassigned, task sheet opens from a row.


## Block drag handles — run `20260725-124236-49880f12`

Verdict: Ready with fixes. Four findings validated and all four applied (`fix(review)` commit: chunk-failure fallback, post-drag NodeRangeSelection branch, real-mount smoke test, real key-event binding test). Remaining advisories (no tracker sink; this file is the durable record):

- P3 — `doc-editor.tsx` slash menu + Alt+Arrow interplay: modified arrows aren't swallowed while the slash menu is open (menu cycles or block moves with stranded slash text). Suggested one-line swallow in handleKeyDown.
- P3 — `block-move.ts` caret restores to block start after a text-block move (offset not preserved).
- P3 — multi-block text selections move only the anchor's block (documented single-block v1 scope).
- Coverage: cross-model adversarial peer not attempted this run (codex route recorded degraded after two 600s timeouts); local adversarial persona ran instead. Simplify pass: 0 fixes (all three lenses clean).


## Phase 2 (kanban-in-doc) — run `20260724-232321-5c5ec11d`

Verdict: Ready with fixes. Four findings validated; three applied and committed (`fix(review): apply Phase 2 review findings and fix shortcut provider render loop` — which also fixed a pre-existing infinite render loop in `KeyboardShortcutsProvider`). Residuals below; GitHub Issues remains disabled on this fork, so this file is the durable record.

- **P2 — `apps/web/src/components/docs/doc-board-embed.tsx:104` — Same project embedded twice renders duplicate TaskDetailsSheets** (correctness, validated). Both matching embeds mount an overlay sheet for the same taskId. Fix needs a design call: first-embed-claims registry vs hoisting the sheet to the doc route. Edge case (same project embedded twice AND a task opened).
- **P1@anchor-50 — `apps/web/src/components/docs/doc-editor.tsx:541` — Stored picker insertion position not validated before `insertContentAt`** (correctness). `insertContentAt` throws RangeError on out-of-range positions (verified in installed @tiptap/core); reachable if the doc re-syncs while the picker is open. Suggested: clamp to `doc.content.size` + try/finally around insert. Below the apply confidence bar; cheap defensive fix for a follow-up.
- **P3 — `apps/web/src/components/docs/extensions/kaneo-board.tsx:41` — Serialized embed HTML links to a non-existent route** (correctness, advisory). Fallback anchor uses `/dashboard/project/{id}`, which isn't a real route; fine until a real export pipeline exists.
- **P2 — `apps/web/src/components/docs/doc-editor.tsx:520` — Board-picker wiring is bespoke; `/table`//`/calendar` would re-add the state/branch/callback/JSX quadruplet** (maintainability, owner: human). Suggested generic `command.picker` hook + `pendingEmbed` state when the next embed type lands.
- **Coverage notes:** cross-model adversarial peer (Codex) timed out at its 600s cap in both Phase 1 and Phase 2 runs — adversarial lens degraded both times; do not auto-retry this route in this environment. End-to-end browser smoke of the embed flow passed after the Docker daemon recovered: fresh user → workspace → doc → `/board` → inline project creation → live board rendered in-doc with autosave "Saved", project visible workspace-wide, zero unexpected page reloads.


Source: ce-code-review run `20260724-201446-6b1afe73` (branch `feat/documents-module`, base `90d8b695`). Verdict: Ready with fixes. Seven actionable findings survived validation; four were applied and committed (`fix(review): apply review findings`). The three below were not applied and have no tracker sink (GitHub Issues is disabled on this fork), so this file is their durable record.

## Residual Review Findings

- **P1 — `apps/api/src/database/schema.ts:968` — User deletion cascades to hard-delete document subtrees** (security, validated). Deleting a user hard-deletes every document they created, and via the parentId cascade, subtrees others contributed to. Suggested fix: make `documentTable.createdBy` nullable with `onDelete: "set null"` (matching `taskAttachmentTable.createdBy`) and regenerate migration 0034 (still unreleased on this branch). Not applied: schema/contract change requiring a product decision (matches the repo-wide user-FK cascade convention, but the blast radius on documents is larger).
- **P1 — `apps/api/src/document/controllers/move-document.ts:86` — Move sibling renumbering and position param are untested** (testing, validated). The `position` splice/renumber logic (including the skip-no-op-write branch) has no coverage; regressions ship silently. Suggested fix: integration tests seeding 3+ siblings, moving to start/middle/end/out-of-range positions, asserting the full sibling sortOrder sequence.
- **P1 — `apps/web/src/components/docs/doc-editor.tsx:433` — Editor conflict-aware re-sync guard has no test** (testing, validated). The isFocused/hasPendingEdits guard preventing external updates from clobbering in-flight typing is untested. Suggested fix: two component tests — blurred + changed `updatedAt` syncs content; focused/pending + changed `updatedAt` does not.

## Dropped by validation (recorded for context, no action required)

- List-query composite index and recursive-CTE ancestor walk: judged optimization preferences at current scale, not defects.
- Title length bound: unbounded `v.string()` titles are the repo-wide validator convention.

No settled-decision conflicts were reported by implementation or review.
