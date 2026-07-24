import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyboardShortcutsProvider } from "@/hooks/use-keyboard-shortcuts";
import useBulkSelectionStore from "@/store/bulk-selection";
import type { ProjectWithTasks } from "@/types/project";
import KanbanBoard from "./index";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutate: vi.fn() }),
}));

// The shortcut wiring under test lives entirely in KanbanBoard itself
// (useRegisterShortcuts + bulk-selection store); the column/card/toolbar
// subtrees drag in router links, i18n, and a pile of query hooks that are
// irrelevant here, so they are stubbed.
vi.mock("./column", () => ({
  default: () => <div data-testid="column-stub" />,
}));
vi.mock("./task-card", () => ({
  default: () => null,
}));
vi.mock("../bulk-selection/bulk-toolbar", () => ({
  default: () => null,
}));

// ListView registers the exact same j/k/Enter shortcuts behind the same
// `disableShortcuts ? {} : {...}` guard (see list-view/index.tsx), so this
// one file covers the disable-shortcuts contract for both surfaces.

function makeProject(): ProjectWithTasks {
  return {
    id: "proj-1",
    name: "My project",
    workspaceId: "ws-1",
    columns: [
      {
        id: "col-1",
        name: "To do",
        tasks: [
          { id: "task-1", title: "First task" },
          { id: "task-2", title: "Second task" },
        ],
      },
    ],
  } as unknown as ProjectWithTasks;
}

function renderBoard(disableShortcuts?: boolean) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <KeyboardShortcutsProvider>
        <KanbanBoard
          disableShortcuts={disableShortcuts}
          project={makeProject()}
        />
      </KeyboardShortcutsProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useBulkSelectionStore.setState({
    selectedTaskIds: new Set(),
    isSelectMode: false,
    availableTaskIds: [],
    focusedTaskId: null,
  });
});

afterEach(() => {
  cleanup();
});

describe("KanbanBoard keyboard shortcuts", () => {
  it("registers no j/k/Enter handlers when disableShortcuts is set", () => {
    renderBoard(true);

    fireEvent.keyDown(document.body, { key: "j" });
    fireEvent.keyDown(document.body, { key: "k" });
    fireEvent.keyDown(document.body, { key: "Enter" });

    expect(navigate).not.toHaveBeenCalled();
    expect(useBulkSelectionStore.getState().focusedTaskId).toBeNull();
  });

  it("engages the j shortcut when disableShortcuts is omitted", () => {
    renderBoard();

    fireEvent.keyDown(document.body, { key: "j" });

    expect(useBulkSelectionStore.getState().focusedTaskId).toBe("task-1");
    expect(navigate).toHaveBeenCalledWith({
      to: ".",
      search: { taskId: "task-1" },
    });
  });
});
