---
title: Cross-Project Tasks View - Plan
type: feat
date: 2026-07-25
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Cross-Project Tasks View - Plan

## Goal Capsule

- **Objective:** A workspace-level "Tasks" view showing tasks across all projects with filters — defaulting to *assigned to me* — closing the cross-project visibility gap the user named ("all tasks that are owned by me across projects").
- **Authority hierarchy:** codebase conventions > this plan's sketches; `CLAUDE.md` anti-over-engineering governs.
- **Stop conditions:** stop and surface if workspace membership turns out not to imply all-projects-read (research says it does — the only project-level concept is public sharing), or if the flat-list endpoint cannot express the filters without regressing the existing per-project endpoint.
- **Tail ownership:** pipeline owns simplify/review/ship; commit + push to fork, **no PR** (standing user instruction).

## Product Contract

### Summary

A "Tasks" item in the workspace nav opens a cross-project list: every task in the workspace the member can see, filtered by assignee (default: the current user), status, priority, and due date, grouped by project, with pagination. Clicking a row opens the existing task details sheet. It is a general cross-project view where "me" is the default filter, not a hardwired My-Tasks page (user-approved — same cost, more useful than a me-only view).

### Requirements

- R1. A workspace member can open `Tasks` from the workspace nav and see tasks across all the workspace's projects.
- R2. The view defaults to *assigned to me*; the assignee filter can be changed (any member, or unassigned, or everyone).
- R3. Filters: status, priority, due-date range; sorting (due date, priority, created, title); pagination for large workspaces.
- R4. Rows show project identity (icon/name + `SLUG-number`), title, status, priority, due date, assignee — grouped by project.
- R5. Clicking a row opens the existing task details sheet (edits flow through the normal task API); closing returns to the list with filters intact.
- R6. Access is workspace-membership-gated, same as every other workspace read (no new permission resource).
- R7. Filter state persists across visits (per workspace), mirroring how board filters persist.

### Scope Boundaries

- **Deferred to follow-up work:** cross-*workspace* aggregation; saved/shared filter presets; **URL-search-param filters / shareable filtered links** (localStorage-first for v1, noted as a stronger expectation for a reporting view); dedicated mobile filter-bar treatment (inherits the board's flex-wrap fallback); bulk actions from this view; a "My Tasks" doc-embed or `/table` embed reusing this endpoint; drag re-ordering in this view (tasks keep their per-project ordering).

## Planning Contract

### Key Technical Decisions

- KTD1. **New flat-list controller + route, not a parameterized `getTasks`.** The reusable part of `get-tasks.ts` is the flat query plumbing (conditions array, `buildOrderBy`, label/external-link batching — the single-project predicate is one line); the non-reusable 40% (project-existence check, single-project column fetch, columns/planned/archived envelope) is actively wrong cross-project. A new controller returns `{ data: rows[], pagination }` where each row carries `projectId/projectSlug/projectName/projectIcon` from the join that already exists. Existing consumers are untouched. Ordering: `ORDER BY projectName asc` first, then the requested `sortBy` within each project — groups stay contiguous across pages (KTD6). Archived tasks are excluded by default (mirroring the board, which segregates them); `status=archived` explicitly returns only archived tasks; `planned` tasks appear as ordinary rows. Default sort: `dueDate asc`; `position` and `number` are excluded from the sort picklist (project-relative keys with no cross-project meaning).
- KTD2. **Scope via `projectTable.workspaceId` join; guard via `workspaceAccess.fromQuery()` only.** Verified: workspace membership implies all-projects-read (no intra-workspace project ACL exists; `isPublic` is about anonymous sharing). Mirrors the document list route's guard.
- KTD3. **Server-side filtering/pagination (not the board's client-side filter model).** The endpoint accepts `assigneeId` (concrete id, `unassigned` → `IS NULL`, absent → everyone), `status`, `priority`, `dueBefore/dueAfter`, plus a `noDueDate` token (→ `dueDate IS NULL`, mirroring `unassigned`), `sortBy/sortOrder`, `page/limit`. The client keeps a **view-specific single-select filter type** (NOT `BoardFilters` verbatim — its multi-select `string[]` arrays cannot translate to the single-value params; deliberate divergence from the board) persisted under `kaneo:workspace-tasks-filters:${workspaceId}` (R7). Categorical due filters map client-side: `dueThisWeek`/`dueNextWeek` → computed `dueBefore`/`dueAfter` bounds; `noDueDate` → the `noDueDate` param.
- KTD4. **New lightweight row list, not `ListView`/`BacklogListView` reuse.** Those hard-require `ProjectWithTasks` with column buckets, dnd stores, and per-project navigation; bending them costs more than a flat grouped-row component that reuses row *styling* conventions and the existing `TaskDetailsSheet` (per-row `projectId`, `taskId` search param — the doc route's sheet wiring from the board-embed work is the direct precedent).
- KTD5. **"Me" resolves client-side to `user.id`** (no server sentinel): the endpoint takes a concrete `assigneeId`; the view passes the auth user's id by default. `unassigned` and `noDueDate` are the two special tokens (server maps them to `IS NULL` predicates).
- KTD6. **Load-more pagination appending to contiguous groups.** No in-repo view combines grouping with pagination, so this sets the pattern: the client renders a "Load more" control that fetches the next page and appends rows; because the server orders project-first (KTD1), appended rows continue the current group or start the next one — a project header never repeats and groups never fragment. Discrete numbered pages were rejected (they split groups); scroll-listener infinite scroll deferred (button is simpler and testable).

### Assumptions

- No new indexes needed: `task_assigneeId_idx` + `task_projectId_idx` carry the common queries at self-host scale; the workspace scoping joins `projectTable` (indexed by workspace).
- Response rows reuse the enriched shape the per-project list already emits (assigneeName/assigneeId/assigneeImage + labels); a valibot schema is defined for the new endpoint (the old one uses `v.any()` — not a pattern to copy).

## Implementation Units

### U1. Workspace-tasks API endpoint

- **Goal:** R1, R2 (server side), R3, R6 — flat, filtered, paginated cross-project task query.
- **Dependencies:** none.
- **Files:** `apps/api/src/task/controllers/get-workspace-tasks.ts` (new), `apps/api/src/task/index.ts` (new route `GET /workspace-tasks` with query validator incl. `workspaceId`, guarded `workspaceAccess.fromQuery()`), `apps/api/src/schemas.ts` (`workspaceTaskRowSchema` + response schema), `tests/api-integration/workspace-tasks.test.ts` (new; follow `document.test.ts` shape).
- **Approach:**
  1. Controller mirrors `get-tasks.ts`'s conditions/orderBy/label-batching plumbing but scopes with a `projectTable.workspaceId = ?` join predicate instead of `projectId`; select includes project id/slug/name/icon per row.
  2. Filters per KTD3 (incl. `unassigned`/`noDueDate` tokens); archived excluded by default, `status=archived` explicit; ordering per KTD1 (project-first, default `dueDate asc` within groups, no `position`/`number`); pagination defaults limit 50, cap 100.
  3. Define a real response schema (rows + pagination) — no `v.any()`.
  4. Register the route inside the existing task router **placed BEFORE the `GET /:id` handler** (e.g. immediately after `GET /tasks/:projectId`) — Hono matches in registration order and a route appended after `GET /:id` is shadowed (`id="workspace-tasks"`). No new AppType surgery — it rides the existing `taskApi` member.
- **Patterns to follow:** `get-tasks.ts` internals; `document` list route's `fromQuery` guard.
- **Test scenarios:**
  - Tasks from two projects in the workspace both appear; a task in another workspace never does.
  - `assigneeId=<user>` returns only that user's tasks; `unassigned` returns only assignee-less tasks; absent returns all.
  - Status/priority/due-range filters and dueDate sort behave; pagination returns correct pages + total.
  - Non-member gets 403 (workspaceAccess).
  - Rows carry project slug/name and label arrays.
  - `GET /task/workspace-tasks` resolves to the new controller, not the `GET /:id` route (registration-order shadow test).
  - Default query omits archived tasks; `status=archived` returns only them.
  - `noDueDate` returns only tasks without a due date.
  - Rows are ordered project-first, then by the requested sort within each project.
- **Verification:** suite collects (no local Postgres — CI runs it); API build green; OpenAPI renders.

### U2. Tasks view route, filters, nav

- **Goal:** R1, R2, R4, R5, R7 — the workspace Tasks page.
- **Dependencies:** U1.
- **Files:** `apps/web/src/fetchers/task/get-workspace-tasks.ts`, `apps/web/src/hooks/queries/task/use-workspace-tasks.ts`, `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/tasks.tsx` (with `validateSearch` for `taskId`), `apps/web/src/components/workspace-tasks/` (filter bar + grouped row list + colocated tests), `apps/web/src/components/nav-main.tsx` (Tasks item), root `i18n/*.json` (targeted keys, 12 locales).
- **Approach:**
  1. Typed fetcher/hook off the RPC client (query key `["workspace-tasks", workspaceId, filters]`).
  2. Route renders `WorkspaceLayout` with a filter bar (assignee select defaulting to the auth user, status, priority, due-range, sort) and the grouped list; filter state initialized from `localStorage` (`kaneo:workspace-tasks-filters:${workspaceId}`) per KTD3/R7.
  3. Rows grouped by project (project header: icon + name), each row: `SLUG-number`, title, status, priority chip, due date, assignee avatar — styling mirrors existing task-row conventions without importing `ListView`.
  4. Row click sets the `taskId` search param; `TaskDetailsSheet(taskId, row.projectId, workspaceId)` renders exactly like the doc route's wiring; close clears the param.
  5. States: loading skeleton; empty (no tasks match — distinct copy for "no tasks assigned to you" default vs filtered-empty); error with retry.
  6. Pagination per KTD6: a "Load more" control appends the next page; groups continue contiguously (server orders project-first); the control disappears when the last page is reached.
  7. Accessibility: each row is keyboard-operable (`role="button"`, `tabIndex=0`, Enter AND Space activate — deliberately exceeding `task-row.tsx`, which lacks these); project group headers are semantic headings (`h3`-level) so assistive tech can jump between groups.
  8. Nav item (`navigation:sidebar.tasks`, `CheckSquare`-style icon) mirroring the Docs entry.
- **Patterns to follow:** docs route/nav additions from this branch; `task-row.tsx` for row visual language; doc route's task-sheet wiring.
- **Test scenarios:**
  - Default fetch passes the auth user's id as `assigneeId`; switching assignee to "everyone" drops the param.
  - Rows grouped under correct project headers; row click opens the sheet with that row's projectId; close clears `taskId`.
  - Filter state round-trips localStorage per workspace.
  - Empty-default state renders the "no tasks assigned to you" copy; filtered-empty renders the no-match copy.
  - Loading and error states render.
  - Load-more appends the next page's rows without repeating a project header (group continuity).
  - A row activates via Enter and via Space; group headers render as headings.
- **Verification:** web tests green; tsc 0; build green; `pnpm i18n:check` no new failures; manual smoke.

## Verification Contract

| Gate | Command |
|---|---|
| Web tests | `pnpm --filter @kaneo/web test` |
| API build + integration collection | `pnpm --filter @kaneo/api build`; `npx vitest list --config vitest.integration.config.ts` (suite runs in CI Postgres) |
| Types | `npx tsc -p apps/web/tsconfig.json --noEmit` (0 errors) |
| Lint | `pnpm exec biome check` on touched files |
| i18n | `pnpm i18n:check` no new failures vs baseline |
| Smoke | dev instance: nav → Tasks; default shows my tasks across two projects; open/close a task sheet; switch filters; reload persists them |

## Definition of Done

- Both units implemented with scenarios covered and gates green; the view proves R1-R7 in the dev-instance smoke; per-project board/list/backlog behavior untouched; no dead code.
