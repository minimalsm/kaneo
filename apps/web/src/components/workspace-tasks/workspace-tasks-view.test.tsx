import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GetWorkspaceTasksParams,
  WorkspaceTaskRow,
} from "@/fetchers/task/get-workspace-tasks";
import type { WorkspaceTasksFilters } from "./workspace-tasks-filters";
import {
  DEFAULT_WORKSPACE_TASKS_FILTERS,
  saveWorkspaceTasksFilters,
  workspaceTasksFiltersStorageKey,
} from "./workspace-tasks-filters";
import { WorkspaceTasksView } from "./workspace-tasks-view";

const navigate = vi.fn();
const searchMock = vi.fn<() => Record<string, unknown>>(() => ({}));
const getWorkspaceTasksMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useSearch: () => searchMock(),
}));

vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  default: () => ({ user: { id: "user-1", name: "Me" } }),
  useAuth: () => ({ user: { id: "user-1", name: "Me" } }),
}));

vi.mock("@/fetchers/task/get-workspace-tasks", () => ({
  default: (params: GetWorkspaceTasksParams) => getWorkspaceTasksMock(params),
}));

vi.mock("./workspace-tasks-filter-bar", () => ({
  default: (props: {
    filters: WorkspaceTasksFilters;
    onFiltersChange: (filters: WorkspaceTasksFilters) => void;
  }) => (
    <div data-testid="filter-bar-stub">
      <button
        type="button"
        onClick={() =>
          props.onFiltersChange({ ...props.filters, assignee: "everyone" })
        }
      >
        set-everyone
      </button>
      <button
        type="button"
        onClick={() =>
          props.onFiltersChange({ ...props.filters, priority: "high" })
        }
      >
        set-priority-high
      </button>
    </div>
  ),
}));

vi.mock("@/components/task/task-details-sheet", () => ({
  default: (props: {
    taskId?: string;
    projectId: string;
    workspaceId: string;
    onClose: () => void;
  }) => (
    <div
      data-testid="task-details-sheet-stub"
      data-task-id={props.taskId}
      data-project-id={props.projectId}
      data-workspace-id={props.workspaceId}
    >
      <button type="button" onClick={props.onClose}>
        close-sheet
      </button>
    </div>
  ),
}));

function makeRow(overrides: Partial<WorkspaceTaskRow> = {}): WorkspaceTaskRow {
  return {
    id: "task-1",
    title: "Task one",
    number: 1,
    description: null,
    status: "to-do",
    priority: "medium",
    startDate: null,
    dueDate: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    userId: "user-1",
    assigneeId: "user-1",
    assigneeName: "Me",
    assigneeImage: null,
    projectId: "proj-a",
    projectSlug: "ALP",
    projectName: "Alpha",
    projectIcon: "Layout",
    labels: [],
    externalLinks: [],
    ...overrides,
  } as WorkspaceTaskRow;
}

function makeResponse(
  rows: WorkspaceTaskRow[],
  { page = 1, totalPages = 1 }: { page?: number; totalPages?: number } = {},
) {
  return {
    data: rows,
    pagination: { total: rows.length, page, pageSize: 50, totalPages },
  };
}

function renderView(workspaceId = "ws-1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceTasksView workspaceId={workspaceId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  searchMock.mockReturnValue({});
  getWorkspaceTasksMock.mockResolvedValue(makeResponse([makeRow()]));
});

afterEach(() => {
  cleanup();
});

describe("WorkspaceTasksView", () => {
  it("passes the auth user's id as assigneeId by default", async () => {
    renderView();

    expect(await screen.findByText("Task one")).toBeInTheDocument();
    expect(getWorkspaceTasksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        assigneeId: "user-1",
        sortBy: "dueDate",
        page: 1,
      }),
    );
  });

  it("drops the assigneeId param when switching to everyone and persists the choice", async () => {
    renderView();
    await screen.findByText("Task one");

    fireEvent.click(screen.getByText("set-everyone"));

    await waitFor(() => {
      const lastCall = getWorkspaceTasksMock.mock.calls.at(-1)?.[0];
      expect(lastCall).toBeDefined();
      expect("assigneeId" in lastCall).toBe(false);
    });
    expect(
      localStorage.getItem(workspaceTasksFiltersStorageKey("ws-1")),
    ).toContain('"assignee":"everyone"');
  });

  it("initializes filters from localStorage per workspace", async () => {
    saveWorkspaceTasksFilters("ws-1", {
      ...DEFAULT_WORKSPACE_TASKS_FILTERS,
      assignee: "unassigned",
      priority: "urgent",
    });
    renderView("ws-1");

    await waitFor(() => {
      expect(getWorkspaceTasksMock).toHaveBeenCalledWith(
        expect.objectContaining({
          assigneeId: "unassigned",
          priority: "urgent",
        }),
      );
    });
  });

  it("groups rows under h3 project headers", async () => {
    getWorkspaceTasksMock.mockResolvedValue(
      makeResponse([
        makeRow({ id: "t-1", title: "Alpha task" }),
        makeRow({
          id: "t-2",
          title: "Beta task",
          projectId: "proj-b",
          projectSlug: "BET",
          projectName: "Beta",
        }),
      ]),
    );
    renderView();

    await screen.findByText("Alpha task");
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings).toHaveLength(2);
    expect(headings[0]).toHaveTextContent("Alpha");
    expect(headings[1]).toHaveTextContent("Beta");
  });

  it("opens the sheet with the clicked row's projectId and clears taskId on close", async () => {
    getWorkspaceTasksMock.mockResolvedValue(
      makeResponse([
        makeRow({ id: "t-9", title: "Clickable task", projectId: "proj-x" }),
      ]),
    );
    renderView();

    fireEvent.click(await screen.findByText("Clickable task"));
    expect(navigate).toHaveBeenCalledWith({
      to: ".",
      search: { taskId: "t-9" },
    });

    searchMock.mockReturnValue({ taskId: "t-9" });
    cleanup();
    renderView();
    const sheet = await screen.findByTestId("task-details-sheet-stub");
    expect(sheet).toHaveAttribute("data-task-id", "t-9");
    expect(sheet).toHaveAttribute("data-project-id", "proj-x");
    expect(sheet).toHaveAttribute("data-workspace-id", "ws-1");

    fireEvent.click(screen.getByText("close-sheet"));
    expect(navigate).toHaveBeenCalledWith({
      to: ".",
      search: {},
      replace: true,
    });
  });

  it("renders the assigned-to-me empty copy for the default filters", async () => {
    getWorkspaceTasksMock.mockResolvedValue(makeResponse([]));
    renderView();

    expect(
      await screen.findByText("workspaceTasks:empty.assignedToMe"),
    ).toBeInTheDocument();
  });

  it("renders the no-match empty copy when filters are non-default", async () => {
    getWorkspaceTasksMock.mockResolvedValue(makeResponse([]));
    renderView();
    await screen.findByTestId("workspace-tasks-empty");

    fireEvent.click(screen.getByText("set-priority-high"));

    expect(
      await screen.findByText("workspaceTasks:empty.noMatch"),
    ).toBeInTheDocument();
  });

  it("renders a loading skeleton while fetching", async () => {
    getWorkspaceTasksMock.mockReturnValue(new Promise(() => {}));
    renderView();

    expect(screen.getByTestId("workspace-tasks-loading")).toBeInTheDocument();
  });

  it("renders an error state with retry", async () => {
    getWorkspaceTasksMock.mockRejectedValue(new Error("boom"));
    renderView();

    expect(
      await screen.findByTestId("workspace-tasks-error"),
    ).toBeInTheDocument();
    const callsBefore = getWorkspaceTasksMock.mock.calls.length;

    getWorkspaceTasksMock.mockResolvedValue(makeResponse([makeRow()]));
    fireEvent.click(screen.getByText("workspaceTasks:error.retry"));

    await screen.findByText("Task one");
    expect(getWorkspaceTasksMock.mock.calls.length).toBeGreaterThan(
      callsBefore,
    );
  });

  it("appends the next page on load-more without repeating project headers", async () => {
    getWorkspaceTasksMock.mockImplementation(
      (params: GetWorkspaceTasksParams) => {
        if ((params.page ?? 1) === 1) {
          return Promise.resolve(
            makeResponse(
              [
                makeRow({ id: "t-1", title: "Alpha one" }),
                makeRow({ id: "t-2", title: "Alpha two" }),
              ],
              { page: 1, totalPages: 2 },
            ),
          );
        }
        return Promise.resolve(
          makeResponse(
            [
              makeRow({ id: "t-3", title: "Alpha three" }),
              makeRow({
                id: "t-4",
                title: "Beta one",
                projectId: "proj-b",
                projectSlug: "BET",
                projectName: "Beta",
              }),
            ],
            { page: 2, totalPages: 2 },
          ),
        );
      },
    );
    renderView();

    await screen.findByText("Alpha one");
    fireEvent.click(screen.getByText("workspaceTasks:loadMore"));

    await screen.findByText("Alpha three");
    expect(screen.getByText("Beta one")).toBeInTheDocument();
    // Group continuity: page-2 Alpha rows continue under the single Alpha header.
    const headings = screen.getAllByRole("heading", { level: 3 });
    const alphaHeadings = headings.filter((h) =>
      h.textContent?.includes("Alpha"),
    );
    expect(alphaHeadings).toHaveLength(1);
    // Last page reached: the control disappears.
    await waitFor(() => {
      expect(
        screen.queryByText("workspaceTasks:loadMore"),
      ).not.toBeInTheDocument();
    });
  });
});
