import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkspaceTasksFilterBar from "./workspace-tasks-filter-bar";
import { DEFAULT_WORKSPACE_TASKS_FILTERS } from "./workspace-tasks-filters";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  default: () => ({ user: { id: "user-1", name: "Me" } }),
  useAuth: () => ({ user: { id: "user-1", name: "Me" } }),
}));

vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({
      data: {
        members: [
          { userId: "user-1", user: { name: "Me" } },
          { userId: "user-2", user: { name: "Grace Hopper" } },
        ],
      },
    }),
  }),
);

afterEach(() => {
  cleanup();
});

describe("WorkspaceTasksFilterBar", () => {
  it("renders the five filter selects with the default state", () => {
    render(
      <WorkspaceTasksFilterBar
        workspaceId="ws-1"
        filters={DEFAULT_WORKSPACE_TASKS_FILTERS}
        onFiltersChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("toolbar", {
        name: "workspaceTasks:filters.toolbarLabel",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("tasks:assignee.label")).toHaveTextContent(
      "workspaceTasks:filters.me",
    );
    expect(screen.getByLabelText("tasks:status.label")).toHaveTextContent(
      "workspaceTasks:filters.allStatuses",
    );
    expect(screen.getByLabelText("tasks:priority.label")).toHaveTextContent(
      "workspaceTasks:filters.allPriorities",
    );
    expect(
      screen.getByLabelText("workspaceTasks:filters.dueLabel"),
    ).toHaveTextContent("workspaceTasks:filters.due.any");
    expect(
      screen.getByLabelText("workspaceTasks:filters.sortLabel"),
    ).toHaveTextContent("workspaceTasks:filters.sort.dueDate");
  });

  it("shows a member's name when a concrete assignee is selected", () => {
    render(
      <WorkspaceTasksFilterBar
        workspaceId="ws-1"
        filters={{ ...DEFAULT_WORKSPACE_TASKS_FILTERS, assignee: "user-2" }}
        onFiltersChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("tasks:assignee.label")).toHaveTextContent(
      "Grace Hopper",
    );
  });
});
