---
title: Block Drag Handles in Docs - Plan
type: feat
date: 2026-07-25
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Block Drag Handles in Docs - Plan

## Goal Capsule

- **Objective:** Notion-style block manipulation in the doc editor — a hover drag handle in the left gutter of every top-level block, plus keyboard move-up/move-down — closing the drag-handles item from the user's original Phase 1 roadmap sketch.
- **Authority hierarchy:** codebase conventions > this plan's sketches; `CLAUDE.md` anti-over-engineering governs.
- **Stop conditions:** stop and surface if `@tiptap/extension-drag-handle@3.28.0` proves incompatible at runtime with the installed editor (its peer pins match, but it statically pulls the collaboration/yjs modules), or if handle positioning cannot coexist with the slash-menu overlay.
- **Tail ownership:** pipeline owns simplify/review/ship; commit + push to fork, **no PR** (standing user instruction).

## Product Contract

### Summary

Hovering any block in an editable doc shows a drag handle in the left gutter; dragging it moves the whole block. Alt+ArrowUp/Down moves the block containing the cursor (or the selected atom block, e.g. a board embed) among its siblings. Viewers see neither affordance. The board embed keeps its own header grip and never shows a duplicate gutter handle.

### Requirements

- R1. An editable doc shows a drag handle near the hovered top-level block (paragraphs, headings, lists, quotes, code blocks, tables); dragging it reorders the block.
- R2. The `kaneoBoard` block is excluded from the gutter handle (its header grip already owns node dragging) — no double handles.
- R3. Alt+ArrowUp / Alt+ArrowDown moves the current block (text cursor's top-level ancestor, or the node-selected atom) one sibling up/down; no-ops at document edges without error.
- R4. Read-only viewers get no handle and no keyboard move.
- R5. Existing interactions are unregressed: slash menu, bubble menu, board-embed header grip drag, autosave (a block move persists via the normal autosave path).

## Planning Contract

### Key Technical Decisions

- KTD1. **Official `@tiptap/extension-drag-handle@3.28.0` + `@tiptap/extension-drag-handle-react@3.28.0`, exact-pinned, component-only registration.** The React `<DragHandle>` component registers the ProseMirror plugin itself; do NOT also add the extension to the editor's extensions list — both register under the same `PluginKey("dragHandle")` and ProseMirror rejects the duplicate at mount (verified in both packages' 3.28.0 dist). Chosen over the community `tiptap-extension-global-drag-handle`: the official package is MIT, exactly version-matched to the installed Tiptap 3.28.0, ships a React component fitting the existing shell, and is the only candidate whose component surface supports per-node suppression (via `onNodeChange`, per KTD3) needed for R2. Accepted cost: it statically imports the collaboration/yjs modules (~25-30 kB gzip) despite this app not using collaboration — recorded, not mitigated (the docs route is already the heaviest chunk; lazy-loading is deferred).
- KTD2. **Hand-rolled keyboard-move extension** (`addKeyboardShortcuts` with Alt-Arrow bindings performing a delete+insert sibling swap in one transaction, selection restored). Chosen over reusing `lift`/`sink` (those are list-nesting commands, not sibling reorder). No keymap precedent exists in the repo; this introduces the first, in the docs extensions directory.
- KTD3. **Exclusion via `onNodeChange`, nested mode stays disabled.** `kaneoBoard` keeps its header grip (tests pin it; it is the block's selection surface). The gutter handle suppresses itself for that node type in the `<DragHandle>` component's `onNodeChange` callback (hide the handle element when `node.type.name === "kaneoBoard"`). `nested.rules` is NOT usable here: rule scoring only runs when nested mode is enabled, and enabling it switches drag targeting to nested scoring — contradicting R1's top-level-only scope (verified in the 3.28.0 dist).

### Assumptions

- Overlay reconciliation: the drag handle hides while the slash menu is open (one overlay at a time per block); the handle element carries a `title` tooltip naming the Alt+Arrow shortcut for discoverability.
- Handle gutter fits in the existing `max-w-3xl` + `p-8` column padding; minor offset tuning is implementation detail.
- The `<DragHandle>` React component renders beside `<EditorContent>` gated on `canEdit`, exactly like the bubble menu (the extension does not watch `editable` itself).

## Implementation Units

### U1. Gutter drag handle

- **Goal:** R1, R2, R4 — hover handle for all blocks except `kaneoBoard`, editors only.
- **Dependencies:** none.
- **Files:** `apps/web/package.json` (+ lockfile), `apps/web/src/components/docs/doc-editor.tsx`, `apps/web/src/index.css` (handle styling if needed), `apps/web/src/components/docs/doc-editor.test.tsx` (extend), root `i18n/*.json` (required: handle aria-label + tooltip strings, all 12 locales, targeted insertion).
- **Approach:**
  1. Install the two packages exact-pinned to 3.28.0. Expect a larger lockfile diff: the drag-handle dist statically imports `@tiptap/extension-node-range@3.28.0`, `@tiptap/extension-collaboration@3.28.0`, `@tiptap/y-tiptap`, `yjs`, and `y-protocols`, pulled via pnpm auto-install-peers.
  2. Component-only registration per KTD1: render `<DragHandle editor={editor} onNodeChange={...}>` beside `EditorContent` only when `canEdit`; do not touch the extensions list.
  3. kaneoBoard suppression per KTD3 via `onNodeChange`.
  4. Handle visibility follows the `docs-tree-item.tsx` touch convention: always visible below `md`, hover-revealed at `md+` (`md:opacity-0 md:group-hover:opacity-100`-style classes) — no hover-only affordance on touch viewports.
  5. Drag feedback: verify whether the 3.28.0 extension integrates ProseMirror `dropCursor` for the insertion line; wire `dropCursor` explicitly if not, and give the dragged block a visual in-flight state (reduced opacity).
  6. The handle is a labeled control: unconditional i18n'd `aria-label` (e.g. "Drag to move block") + `title` tooltip naming Alt+ArrowUp/Down.
  7. Hide the handle while the slash menu is open (Assumptions: one overlay at a time).
- **Patterns to follow:** bubble-menu gating in `doc-editor.tsx`; the shell's existing absolute-positioning pattern.
- **Test scenarios:**
  - Editable editor renders the drag-handle element; read-only does not (R4).
  - The onNodeChange suppression hides the handle for a kaneoBoard node (invoke the callback directly with a kaneoBoard node; assert hidden state) — full hover simulation is jsdom-hostile.
  - The handle carries the i18n'd aria-label and the Alt+Arrow tooltip.
  - Opening the slash menu hides the handle (one overlay at a time).
  - The handle's visibility classes gate hover-reveal behind the `md:` variant only (always visible on small viewports).
  - Existing suites (slash menu, board embed, autosave) stay green (R5).
- **Verification:** web tests green; tsc 0; build green; manual drag of a paragraph in the dev instance.

### U2. Keyboard block move

- **Goal:** R3, R4 — Alt+Arrow sibling reorder incl. atom blocks.
- **Dependencies:** none (parallel-safe with U1 but executed serially).
- **Files:** `apps/web/src/components/docs/extensions/block-move.ts` (+ colocated test), registered in `doc-editor.tsx`.
- **Approach:** `Extension.create` with `addKeyboardShortcuts`; command resolves the top-level block (depth-1 ancestor of the text selection, or the NodeSelection's node), computes the previous/next sibling boundary, performs delete+insert in one transaction, restores selection inside the moved block; returns false (no-op) at edges and in read-only state.
- **Patterns to follow:** `kaneo-board.test.ts`'s headless-editor test harness.
- **Test scenarios:**
  - Alt+ArrowDown on the first of three paragraphs makes it second (doc JSON order asserted); Alt+ArrowUp reverses it.
  - First-block ArrowUp / last-block ArrowDown are no-ops (content unchanged, no throw).
  - A node-selected `kaneoBoard` atom moves as a unit and stays selected.
  - Moving a block inside a list item moves the whole top-level list, not the list item (document-level semantics pinned).
  - Read-only editor: shortcut returns false, content unchanged.
- **Verification:** colocated tests green; manual Alt+Arrow in dev instance.

## Verification Contract

| Gate | Command |
|---|---|
| Web tests | `pnpm --filter @kaneo/web test` |
| Types/build | `npx tsc -p apps/web/tsconfig.json --noEmit` (0 errors) + `pnpm --filter @kaneo/web build` |
| Lint | `pnpm exec biome check` on touched files |
| Bundle gate | docs-route chunk gzip delta from the new packages stays within the ~30 kB KTD1 accepts (compare `pnpm --filter @kaneo/web build` output before/after); overage triggers the deferred lazy-loading option |
| Smoke | dev instance: drag a paragraph; Alt+Arrow a block and a board embed; confirm reorder persists after reload |

## Definition of Done

- Both units implemented with scenarios covered and gates green; a moved block survives autosave + reload; no regression to slash/bubble/board-grip behavior; no dead code.
