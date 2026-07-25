import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceTaskRow as WorkspaceTaskRowData } from "@/fetchers/task/get-workspace-tasks";
import WorkspaceTaskRow from "./workspace-task-row";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

function makeTask(
  overrides: Partial<WorkspaceTaskRowData> = {},
): WorkspaceTaskRowData {
  return {
    id: "task-1",
    title: "Fix the flux capacitor",
    number: 42,
    description: null,
    status: "to-do",
    priority: "high",
    startDate: null,
    dueDate: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    userId: "user-1",
    assigneeId: "user-1",
    assigneeName: "Ada Lovelace",
    assigneeImage: null,
    projectId: "proj-1",
    projectSlug: "ENG",
    projectName: "Engineering",
    projectIcon: "Layout",
    labels: [],
    externalLinks: [],
    ...overrides,
  } as WorkspaceTaskRowData;
}

afterEach(() => {
  cleanup();
});

describe("WorkspaceTaskRow", () => {
  it("renders slug-number, title and assignee initials", () => {
    render(<WorkspaceTaskRow task={makeTask()} onOpen={vi.fn()} />);

    expect(screen.getByText("ENG-42")).toBeInTheDocument();
    expect(screen.getByText("Fix the flux capacitor")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("tabindex", "0");
  });

  it("activates via click, Enter and Space", () => {
    const onOpen = vi.fn();
    const task = makeTask();
    render(<WorkspaceTaskRow task={task} onOpen={onOpen} />);
    const row = screen.getByRole("button");

    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(row, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(row, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(3);
    expect(onOpen).toHaveBeenLastCalledWith(task);

    fireEvent.keyDown(row, { key: "Escape" });
    expect(onOpen).toHaveBeenCalledTimes(3);
  });
});
