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

  describe("exact week boundaries", () => {
    // Wednesday, July 22 2026, noon *local time* — the weekday (and thus the
    // computed week window) is identical in every timezone.
    const localNow = new Date(2026, 6, 22, 12, 0, 0);
    const iso = (
      year: number,
      month: number,
      day: number,
      end = false,
    ): string =>
      end
        ? new Date(year, month, day, 23, 59, 59, 999).toISOString()
        : new Date(year, month, day, 0, 0, 0, 0).toISOString();

    it("dueThisWeek with weekStartsOn=1 spans Mon Jul 20 00:00 to Sun Jul 26 23:59:59.999", () => {
      expect(buildDueBounds("dueThisWeek", 1, localNow)).toEqual({
        dueAfter: iso(2026, 6, 20),
        dueBefore: iso(2026, 6, 26, true),
      });
    });

    it("dueThisWeek with weekStartsOn=0 spans Sun Jul 19 00:00 to Sat Jul 25 23:59:59.999", () => {
      expect(buildDueBounds("dueThisWeek", 0, localNow)).toEqual({
        dueAfter: iso(2026, 6, 19),
        dueBefore: iso(2026, 6, 25, true),
      });
    });

    it("dueNextWeek with weekStartsOn=1 spans Mon Jul 27 00:00 to Sun Aug 2 23:59:59.999", () => {
      expect(buildDueBounds("dueNextWeek", 1, localNow)).toEqual({
        dueAfter: iso(2026, 6, 27),
        dueBefore: iso(2026, 7, 2, true),
      });
    });

    it("dueNextWeek with weekStartsOn=0 spans Sun Jul 26 00:00 to Sat Aug 1 23:59:59.999", () => {
      expect(buildDueBounds("dueNextWeek", 0, localNow)).toEqual({
        dueAfter: iso(2026, 6, 26),
        dueBefore: iso(2026, 7, 1, true),
      });
    });
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
