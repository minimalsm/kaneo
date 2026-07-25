import type { DragHandle } from "@tiptap/extension-drag-handle-react";

type DragHandleModule = { default: typeof DragHandle };

/**
 * Deferred loader for the drag-handle chunk, shaped for React.lazy.
 *
 * WHY the catch: React.lazy surfaces a rejected chunk import as a render
 * error, which would crash the whole editor (e.g. offline user, or a stale
 * deploy whose hashed chunk is gone). Losing the drag handle is a cosmetic
 * degradation — block moves still work via Alt+Arrow — so a failed load
 * degrades to rendering no handle instead.
 */
export function loadDragHandle(): Promise<DragHandleModule> {
  return import("@tiptap/extension-drag-handle-react")
    .then((module) => ({ default: module.DragHandle }))
    .catch(() => ({ default: () => null }));
}
