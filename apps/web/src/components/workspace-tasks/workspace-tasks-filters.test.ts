import { afterEach, describe, expect, it } from "vitest";
import {
  buildDueBounds,
  DEFAULT_WORKSPACE_TASKS_FILTERS,
  isDefaultWorkspaceTasksFilters,
  loadWorkspaceTasksFilters,
  saveWorkspaceTasksFilters,
  workspaceTasksFiltersStorageKey,
} from "./workspace-tasks-filters";

afterEach(() => {
  localStorage.clear();
});

describe("workspace tasks filter persistence", () => {
  it("defaults to assigned-to-me when nothing is stored", () => {
    expect(loadWorkspaceTasksFilters("ws-1")).toEqual(
      DEFAULT_WORKSPACE_TASKS_FILTERS,
    );
  });

  it("round-trips filters through localStorage per workspace", () => {
    const filters = {
      assignee: "unassigned",
      status: "in-progress",
      priority: "high",
      due: "dueThisWeek" as const,
      sortBy: "priority" as const,
    };
    saveWorkspaceTasksFilters("ws-1", filters);

    expect(loadWorkspaceTasksFilters("ws-1")).toEqual(filters);
    // A different workspace keeps its own (default) state.
    expect(loadWorkspaceTasksFilters("ws-2")).toEqual(
      DEFAULT_WORKSPACE_TASKS_FILTERS,
    );
    expect(
      localStorage.getItem(workspaceTasksFiltersStorageKey("ws-1")),
    ).toContain("unassigned");
  });

  it("normalizes malformed stored values back to defaults", () => {
    localStorage.setItem(
      workspaceTasksFiltersStorageKey("ws-1"),
      JSON.stringify({ due: "bogus", sortBy: 42, assignee: "" }),
    );
    expect(loadWorkspaceTasksFilters("ws-1")).toEqual(
      DEFAULT_WORKSPACE_TASKS_FILTERS,
    );

    localStorage.setItem(workspaceTasksFiltersStorageKey("ws-1"), "not json");
    expect(loadWorkspaceTasksFilters("ws-1")).toEqual(
      DEFAULT_WORKSPACE_TASKS_FILTERS,
    );
  });

  it("detects default vs non-default filter state", () => {
    expect(
      isDefaultWorkspaceTasksFilters(DEFAULT_WORKSPACE_TASKS_FILTERS),
    ).toBe(true);
    expect(
      isDefaultWorkspaceTasksFilters({
        ...DEFAULT_WORKSPACE_TASKS_FILTERS,
        priority: "high",
      }),
    ).toBe(false);
  });
});

describe("buildDueBounds", () => {
  const now = new Date("2026-07-22T12:00:00.000Z");

  it("returns no bounds for 'any'", () => {
    expect(buildDueBounds("any", 1, now)).toEqual({});
  });

  it("maps noDueDate to the noDueDate token", () => {
    expect(buildDueBounds("noDueDate", 1, now)).toEqual({ noDueDate: true });
  });

  it("maps dueThisWeek/dueNextWeek to week bounds", () => {
    const thisWeek = buildDueBounds("dueThisWeek", 1, now);
    expect(thisWeek.dueAfter).toBeDefined();
    expect(thisWeek.dueBefore).toBeDefined();
    expect(new Date(thisWeek.dueAfter as string) <= now).toBe(true);
    expect(new Date(thisWeek.dueBefore as string) >= now).toBe(true);

    const nextWeek = buildDueBounds("dueNextWeek", 1, now);
    expect(new Date(nextWeek.dueAfter as string) > now).toBe(true);
    expect(
      new Date(nextWeek.dueAfter as string) <
        new Date(nextWeek.dueBefore as string),
    ).toBe(true);
  });
});
