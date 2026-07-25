import { addWeeks, endOfWeek, startOfWeek } from "date-fns";
import type { WorkspaceTasksSortBy } from "@/fetchers/task/get-workspace-tasks";

export const DUE_FILTER_VALUES = [
  "any",
  "dueThisWeek",
  "dueNextWeek",
  "noDueDate",
] as const;

export type WorkspaceTasksDueFilter = (typeof DUE_FILTER_VALUES)[number];

export const SORT_BY_VALUES = [
  "dueDate",
  "priority",
  "createdAt",
  "title",
] as const;

/**
 * View-specific single-select filter state for the workspace tasks view.
 * Deliberately NOT `BoardFilters` — the server endpoint takes single values,
 * not the board's multi-select arrays.
 */
export type WorkspaceTasksFilters = {
  /** "me" | "everyone" | "unassigned" | a member's user id */
  assignee: string;
  /** "all" | a task status (incl. "archived") */
  status: string;
  /** "all" | a task priority */
  priority: string;
  due: WorkspaceTasksDueFilter;
  sortBy: WorkspaceTasksSortBy;
};

export const DEFAULT_WORKSPACE_TASKS_FILTERS: WorkspaceTasksFilters = {
  assignee: "me",
  status: "all",
  priority: "all",
  due: "any",
  sortBy: "dueDate",
};

export function workspaceTasksFiltersStorageKey(workspaceId: string) {
  return `kaneo:workspace-tasks-filters:${workspaceId}`;
}

function normalizeFilters(raw: unknown): WorkspaceTasksFilters {
  const normalized = { ...DEFAULT_WORKSPACE_TASKS_FILTERS };
  if (!raw || typeof raw !== "object") return normalized;

  const candidate = raw as Partial<
    Record<keyof WorkspaceTasksFilters, unknown>
  >;

  if (typeof candidate.assignee === "string" && candidate.assignee) {
    normalized.assignee = candidate.assignee;
  }
  if (typeof candidate.status === "string" && candidate.status) {
    normalized.status = candidate.status;
  }
  if (typeof candidate.priority === "string" && candidate.priority) {
    normalized.priority = candidate.priority;
  }
  if (
    typeof candidate.due === "string" &&
    (DUE_FILTER_VALUES as readonly string[]).includes(candidate.due)
  ) {
    normalized.due = candidate.due as WorkspaceTasksDueFilter;
  }
  if (
    typeof candidate.sortBy === "string" &&
    (SORT_BY_VALUES as readonly string[]).includes(candidate.sortBy)
  ) {
    normalized.sortBy = candidate.sortBy as WorkspaceTasksSortBy;
  }

  return normalized;
}

export function loadWorkspaceTasksFilters(
  workspaceId: string,
): WorkspaceTasksFilters {
  try {
    const stored = localStorage.getItem(
      workspaceTasksFiltersStorageKey(workspaceId),
    );
    if (!stored) return { ...DEFAULT_WORKSPACE_TASKS_FILTERS };
    return normalizeFilters(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_WORKSPACE_TASKS_FILTERS };
  }
}

export function saveWorkspaceTasksFilters(
  workspaceId: string,
  filters: WorkspaceTasksFilters,
) {
  try {
    localStorage.setItem(
      workspaceTasksFiltersStorageKey(workspaceId),
      JSON.stringify(filters),
    );
  } catch {
    // Storage may be unavailable (private mode); filters just won't persist.
  }
}

export function isDefaultWorkspaceTasksFilters(filters: WorkspaceTasksFilters) {
  return (
    filters.assignee === DEFAULT_WORKSPACE_TASKS_FILTERS.assignee &&
    filters.status === DEFAULT_WORKSPACE_TASKS_FILTERS.status &&
    filters.priority === DEFAULT_WORKSPACE_TASKS_FILTERS.priority &&
    filters.due === DEFAULT_WORKSPACE_TASKS_FILTERS.due
  );
}

/**
 * Maps the categorical due filter to concrete query bounds (KTD3).
 */
export function buildDueBounds(
  due: WorkspaceTasksDueFilter,
  weekStartsOn: 0 | 1 = 1,
  now: Date = new Date(),
): { dueAfter?: string; dueBefore?: string; noDueDate?: boolean } {
  switch (due) {
    case "dueThisWeek":
      return {
        dueAfter: startOfWeek(now, { weekStartsOn }).toISOString(),
        dueBefore: endOfWeek(now, { weekStartsOn }).toISOString(),
      };
    case "dueNextWeek": {
      const nextWeek = addWeeks(now, 1);
      return {
        dueAfter: startOfWeek(nextWeek, { weekStartsOn }).toISOString(),
        dueBefore: endOfWeek(nextWeek, { weekStartsOn }).toISOString(),
      };
    }
    case "noDueDate":
      return { noDueDate: true };
    default:
      return {};
  }
}
