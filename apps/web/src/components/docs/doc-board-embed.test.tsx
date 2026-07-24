import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocBoardEmbed } from "./doc-board-embed";

const navigate = vi.fn();
const searchMock = vi.fn<() => Record<string, unknown>>(() => ({}));
const getTasksMock = vi.fn();
const useGetProjectMock = vi.fn(() => ({
  data: { id: "proj-1", name: "My project" },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useParams: () => ({ workspaceId: "ws-1" }),
  useSearch: () => searchMock(),
  Link: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href="#project" data-testid={rest["data-testid"] as string | undefined}>
      {children}
    </a>
  ),
}));

vi.mock("@/fetchers/task/get-tasks", () => ({
  default: (projectId: string) => getTasksMock(projectId),
}));

vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: (args: { id: string; workspaceId: string }) =>
    useGetProjectMock(args),
}));

vi.mock("@/components/kanban-board", () => ({
  default: (props: { disableShortcuts?: boolean }) => (
    <div
      data-testid="kanban-board-stub"
      data-disable-shortcuts={String(props.disableShortcuts)}
    />
  ),
}));

vi.mock("@/components/list-view", () => ({
  default: (props: { disableShortcuts?: boolean }) => (
    <div
      data-testid="list-view-stub"
      data-disable-shortcuts={String(props.disableShortcuts)}
    />
  ),
}));

vi.mock("@/components/task/task-details-sheet", () => ({
  default: (props: {
    taskId?: string;
    projectId: string;
    workspaceId: string;
    onClose: () => void;
  }) => (
    <div data-testid="task-details-sheet-stub" data-task-id={props.taskId}>
      <button type="button" onClick={props.onClose}>
        close-sheet
      </button>
    </div>
  ),
}));

function makeProject() {
  return {
    id: "proj-1",
    name: "My project",
    workspaceId: "ws-1",
    columns: [
      {
        id: "col-1",
        name: "To do",
        tasks: [{ id: "task-1", title: "First task" }],
      },
    ],
  };
}

const setNodeSelection = vi.fn();

function makeProps(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    node: {
      attrs: { projectId: "proj-1", view: "board" },
      ...((overrides.node as object) ?? {}),
    },
    editor: {
      isEditable: true,
      commands: { setNodeSelection },
      ...((overrides.editor as object) ?? {}),
    },
    updateAttributes: vi.fn(),
    getPos: () => 5,
    selected: false,
    ...overrides,
  } as unknown as NodeViewProps;
}

function renderEmbed(props = makeProps()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DocBoardEmbed {...props} />
    </QueryClientProvider>,
  );
  return { view, props };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchMock.mockReturnValue({});
  useGetProjectMock.mockReturnValue({
    data: { id: "proj-1", name: "My project" },
  });
});

afterEach(() => {
  cleanup();
});

describe("DocBoardEmbed", () => {
  it("renders the kanban board with shortcuts disabled once tasks load", async () => {
    getTasksMock.mockResolvedValue(makeProject());

    renderEmbed();

    const board = await screen.findByTestId("kanban-board-stub");
    expect(board.getAttribute("data-disable-shortcuts")).toBe("true");
  });

  it("renders a quiet placeholder on query error, keeping the header", async () => {
    getTasksMock.mockRejectedValue(new Error("forbidden"));

    const { view } = renderEmbed();

    await screen.findByTestId("doc-board-embed-error");
    expect(screen.getByText("documents:boardEmbed.unavailable")).toBeTruthy();
    // Header (selection surface + drag handle) must survive so the block
    // stays selectable/deletable.
    expect(screen.getByTestId("doc-board-embed-header")).toBeTruthy();
    expect(view.container.querySelector("[data-drag-handle]")).toBeTruthy();
  });

  it("renders a skeleton while tasks are loading", () => {
    getTasksMock.mockReturnValue(new Promise(() => {}));

    renderEmbed();

    expect(screen.getByTestId("doc-board-embed-skeleton")).toBeTruthy();
  });

  it("persists the view toggle via updateAttributes when the editor is editable", async () => {
    getTasksMock.mockResolvedValue(makeProject());

    const props = makeProps();
    renderEmbed(props);
    await screen.findByTestId("kanban-board-stub");

    fireEvent.click(
      screen.getByRole("button", { name: "documents:boardEmbed.view.list" }),
    );

    expect(props.updateAttributes).toHaveBeenCalledWith({ view: "list" });
  });

  it("keeps the view toggle local when the editor is read-only", async () => {
    getTasksMock.mockResolvedValue(makeProject());

    const props = makeProps({ editor: { isEditable: false } });
    renderEmbed(props);
    await screen.findByTestId("kanban-board-stub");

    fireEvent.click(
      screen.getByRole("button", { name: "documents:boardEmbed.view.list" }),
    );

    expect(props.updateAttributes).not.toHaveBeenCalled();
    expect(await screen.findByTestId("list-view-stub")).toBeTruthy();
  });

  it("selects the node when the header is clicked", async () => {
    getTasksMock.mockResolvedValue(makeProject());

    renderEmbed();
    await screen.findByTestId("kanban-board-stub");

    fireEvent.click(screen.getByTestId("doc-board-embed-header"));

    expect(setNodeSelection).toHaveBeenCalledWith(5);
  });

  it("opens the task sheet for a matching taskId and clears it on close", async () => {
    getTasksMock.mockResolvedValue(makeProject());
    searchMock.mockReturnValue({ taskId: "task-1" });

    renderEmbed();

    const sheet = await screen.findByTestId("task-details-sheet-stub");
    expect(sheet.getAttribute("data-task-id")).toBe("task-1");

    fireEvent.click(screen.getByText("close-sheet"));
    expect(navigate).toHaveBeenCalledWith({
      to: ".",
      search: {},
      replace: true,
    });
  });

  it("ignores a taskId that does not belong to this project's tasks", async () => {
    getTasksMock.mockResolvedValue(makeProject());
    searchMock.mockReturnValue({ taskId: "other-task" });

    renderEmbed();
    await screen.findByTestId("kanban-board-stub");

    expect(screen.queryByTestId("task-details-sheet-stub")).toBeNull();
  });

  it("confines the drag handle to the header, never the body", async () => {
    getTasksMock.mockResolvedValue(makeProject());

    const { view } = renderEmbed();
    await screen.findByTestId("kanban-board-stub");

    const handles = view.container.querySelectorAll("[data-drag-handle]");
    expect(handles.length).toBe(1);
    expect(
      handles[0].closest('[data-testid="doc-board-embed-header"]'),
    ).toBeTruthy();
    expect(
      view.container
        .querySelector('[data-testid="doc-board-embed-body"]')
        ?.querySelector("[data-drag-handle]"),
    ).toBeNull();
  });
});
