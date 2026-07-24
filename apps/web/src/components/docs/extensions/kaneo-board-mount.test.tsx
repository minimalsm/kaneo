import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KaneoBoard } from "./kaneo-board";

const getTasksMock = vi.fn();

// The DocBoardEmbed import chain reaches src/lib/i18n, which calls
// i18n.use(initReactI18next) at module scope, so the mock must provide it.
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ workspaceId: "ws-1" }),
  useSearch: () => ({}),
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="#project">{children}</a>
  ),
}));

vi.mock("@/fetchers/task/get-tasks", () => ({
  default: (projectId: string) => getTasksMock(projectId),
}));

// The board itself stays stubbed — the KanbanBoard/ListView seam is proven on
// the route pages. This test proves the node view seam: ReactNodeViewRenderer
// mounting the REAL DocBoardEmbed with the node's attrs.
vi.mock("@/components/kanban-board", () => ({
  default: (props: { project: { id: string } }) => (
    <div data-testid="kanban-board-stub" data-project-id={props.project.id} />
  ),
}));

vi.mock("@/components/list-view", () => ({
  default: () => <div data-testid="list-view-stub" />,
}));

vi.mock("@/components/task/task-details-sheet", () => ({
  default: () => null,
}));

// Minimal layout polyfills so ProseMirror's view can mount under jsdom.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
const emptyRectList = () =>
  Object.assign([], {
    item: () => null,
  }) as unknown as DOMRectList;
Range.prototype.getClientRects = emptyRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
if (!Element.prototype.getClientRects) {
  Element.prototype.getClientRects = emptyRectList;
}

function Harness() {
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false }), KaneoBoard],
    content: {
      type: "doc",
      content: [
        {
          type: "kaneoBoard",
          attrs: { projectId: "proj-1", view: "board" },
        },
      ],
    },
  });
  return <EditorContent editor={editor} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  getTasksMock.mockResolvedValue({
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
  });
});

afterEach(() => {
  cleanup();
});

describe("KaneoBoard node view mounting", () => {
  it("mounts the real DocBoardEmbed via ReactNodeViewRenderer with the node attrs", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    // The real node view rendered inside the editor DOM…
    expect(await screen.findByTestId("doc-board-embed")).toBeTruthy();
    // …and the node's projectId attr flowed through DocBoardEmbed into the
    // tasks query and down to the (stubbed) board.
    expect(getTasksMock).toHaveBeenCalledWith("proj-1");
    const board = await screen.findByTestId("kanban-board-stub");
    expect(board.getAttribute("data-project-id")).toBe("proj-1");
  });
});
