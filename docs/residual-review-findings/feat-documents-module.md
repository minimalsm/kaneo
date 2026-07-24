# Residual Review Findings — feat/documents-module

Source: ce-code-review run `20260724-201446-6b1afe73` (branch `feat/documents-module`, base `90d8b695`). Verdict: Ready with fixes. Seven actionable findings survived validation; four were applied and committed (`fix(review): apply review findings`). The three below were not applied and have no tracker sink (GitHub Issues is disabled on this fork), so this file is their durable record.

## Residual Review Findings

- **P1 — `apps/api/src/database/schema.ts:968` — User deletion cascades to hard-delete document subtrees** (security, validated). Deleting a user hard-deletes every document they created, and via the parentId cascade, subtrees others contributed to. Suggested fix: make `documentTable.createdBy` nullable with `onDelete: "set null"` (matching `taskAttachmentTable.createdBy`) and regenerate migration 0034 (still unreleased on this branch). Not applied: schema/contract change requiring a product decision (matches the repo-wide user-FK cascade convention, but the blast radius on documents is larger).
- **P1 — `apps/api/src/document/controllers/move-document.ts:86` — Move sibling renumbering and position param are untested** (testing, validated). The `position` splice/renumber logic (including the skip-no-op-write branch) has no coverage; regressions ship silently. Suggested fix: integration tests seeding 3+ siblings, moving to start/middle/end/out-of-range positions, asserting the full sibling sortOrder sequence.
- **P1 — `apps/web/src/components/docs/doc-editor.tsx:433` — Editor conflict-aware re-sync guard has no test** (testing, validated). The isFocused/hasPendingEdits guard preventing external updates from clobbering in-flight typing is untested. Suggested fix: two component tests — blurred + changed `updatedAt` syncs content; focused/pending + changed `updatedAt` does not.

## Dropped by validation (recorded for context, no action required)

- List-query composite index and recursive-CTE ancestor walk: judged optimization preferences at current scale, not defects.
- Title length bound: unbounded `v.string()` titles are the repo-wide validator convention.

No settled-decision conflicts were reported by implementation or review.
