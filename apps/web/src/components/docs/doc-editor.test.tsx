import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocEditor } from "./doc-editor";

const useDocumentMock = vi.fn();
const mutateAsync = vi.fn();
const permissions = {
  canUpdateDocuments: vi.fn(() => true),
};

// Stable identity: the component recreates the Tiptap editor when `t`
// changes, so the mock must not mint a new function per render.
const translation = { t: (key: string) => key };
vi.mock("react-i18next", () => ({
  useTranslation: () => translation,
  // The kaneoBoard node view's import chain reaches src/lib/i18n, which
  // calls i18n.use(initReactI18next) at module scope.
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@/hooks/queries/document/use-document", () => ({
  default: (args: { id: string }) => useDocumentMock(args),
}));

vi.mock("@/hooks/mutations/document/use-update-document", () => ({
  default: () => ({ mutateAsync }),
}));

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => permissions,
}));

// Version history has its own colocated tests; keep the editor tests focused.
vi.mock("./doc-version-history", () => ({
  DocVersionHistory: () => null,
}));

// The board embed node view mounts router-coupled hooks (useNavigate etc.);
// it has its own colocated tests. A NodeViewWrapper root is still required so
// ReactNodeViewRenderer can mount the node.
vi.mock("./doc-board-embed", async () => {
  const { NodeViewWrapper } = await import("@tiptap/react");
  return {
    DocBoardEmbed: () => <NodeViewWrapper data-testid="doc-board-embed-stub" />,
  };
});

// The picker has its own colocated tests; here we only exercise the wiring:
// capture the props DocEditor passes so tests can drive select/cancel.
const pickerPropsRef = vi.hoisted(() => ({
  current: null as {
    open: boolean;
    workspaceId: string;
    onSelect: (projectId: string) => void;
    onOpenChange: (open: boolean) => void;
  } | null,
}));
vi.mock("./board-picker-dialog", () => ({
  BoardPickerDialog: (props: NonNullable<typeof pickerPropsRef.current>) => {
    pickerPropsRef.current = props;
    return props.open ? <div data-testid="board-picker-open" /> : null;
  },
}));

// Floating-UI positioning is meaningless in jsdom; the bubble menu is not
// under test here.
vi.mock("@tiptap/react/menus", () => ({
  BubbleMenu: () => null,
}));

// The DragHandle component portals into a floating-ui-positioned element and
// registers a hover-driven ProseMirror plugin — both jsdom-hostile. The mock
// pins the wiring contract instead: rendered only for editors, className
// carries the hidden state, onNodeChange drives kaneoBoard suppression.
const dragHandleProps = vi.hoisted(() => ({
  current: null as null | {
    className?: string;
    editor: unknown;
    onNodeChange?: (data: {
      editor: unknown;
      node: { type: { name: string } } | null;
      pos: number;
    }) => void;
    children?: ReactNode;
  },
}));
vi.mock("@tiptap/extension-drag-handle-react", () => ({
  DragHandle: (props: NonNullable<typeof dragHandleProps.current>) => {
    dragHandleProps.current = props;
    return (
      <div className={props.className} data-testid="drag-handle">
        {props.children}
      </div>
    );
  },
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

type DocOverrides = Partial<{
  id: string;
  title: string;
  content: unknown;
  updatedAt: string;
}>;

function makeDoc(overrides: DocOverrides = {}) {
  return {
    id: "doc-1",
    workspaceId: "ws-1",
    parentId: null,
    projectId: null,
    icon: null,
    title: "My doc",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello stored world" }],
        },
      ],
    },
    contentText: "Hello stored world",
    sortOrder: 0,
    archivedAt: null,
    createdBy: "user-1",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

function mockDocument(doc = makeDoc()) {
  useDocumentMock.mockReturnValue({
    data: doc,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

async function renderEditor(documentId = "doc-1") {
  const editorRef: { current: Editor | null } = { current: null };
  const view = render(
    <DocEditor
      documentId={documentId}
      onEditorReady={(editor) => {
        editorRef.current = editor;
      }}
    />,
  );
  await vi.waitFor(() => {
    expect(editorRef.current).toBeTruthy();
  });
  // Flush the readiness state update and the content-hydration effect.
  await act(async () => {});
  // biome-ignore lint/style/noNonNullAssertion: asserted non-null above
  return { ...view, editor: editorRef.current! };
}

function typeText(editor: Editor, text: string) {
  act(() => {
    editor.commands.insertContent(text);
  });
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  pickerPropsRef.current = null;
  dragHandleProps.current = null;
  permissions.canUpdateDocuments.mockReturnValue(true);
  mutateAsync.mockResolvedValue(makeDoc());
  mockDocument();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("DocEditor", () => {
  it("renders the stored ProseMirror JSON content and title", async () => {
    await renderEditor();

    expect(screen.getByText("Hello stored world")).toBeVisible();
    expect(
      screen.getByLabelText("documents:editor.titleLabel"),
    ).toHaveDisplayValue("My doc");
  });

  it("collapses rapid successive edits into one save after the debounce window", async () => {
    const { editor } = await renderEditor();

    typeText(editor, "a");
    typeText(editor, "b");
    typeText(editor, "c");

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "documents:editor.save.saving",
    );

    await advance(700);

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const payload = mutateAsync.mock.calls[0]?.[0];
    expect(payload.id).toBe("doc-1");
    expect(JSON.stringify(payload.content)).toContain("abc");

    await vi.waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "documents:editor.save.saved",
      );
    });
  });

  it("flushes a pending edit on unmount", async () => {
    const { editor, unmount } = await renderEditor();

    typeText(editor, "unsaved edit");
    expect(mutateAsync).not.toHaveBeenCalled();

    unmount();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mutateAsync.mock.calls[0]?.[0]?.content)).toContain(
      "unsaved edit",
    );
  });

  it("surfaces the error indicator when a save fails and recovers on the next success", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("boom"));
    const { editor } = await renderEditor();

    typeText(editor, "x");
    await advance(700);

    await vi.waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "documents:editor.save.error",
      );
    });

    // Content is retained client-side; the next edit retries and clears the
    // error state.
    typeText(editor, "y");
    await advance(700);

    await vi.waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "documents:editor.save.saved",
      );
    });
    expect(mutateAsync).toHaveBeenCalledTimes(2);
  });

  it("does not render a clickable javascript: link from stored content", async () => {
    mockDocument(
      makeDoc({
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "evil link",
                  marks: [
                    {
                      type: "link",
                      attrs: { href: "javascript:alert('pwned')" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
    );

    const { container } = await renderEditor();

    for (const anchor of Array.from(container.querySelectorAll("a"))) {
      expect(anchor.getAttribute("href") ?? "").not.toMatch(/javascript:/i);
    }
  });

  it("gives viewers a read-only editor without a save pipeline", async () => {
    permissions.canUpdateDocuments.mockReturnValue(false);

    const { container, editor } = await renderEditor();

    expect(editor.isEditable).toBe(false);
    expect(container.querySelector('[contenteditable="true"]')).toBeNull();
    // Viewers get a static heading instead of the title input.
    expect(screen.queryByLabelText("documents:editor.titleLabel")).toBeNull();
    expect(screen.getByText("My doc")).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("saves title edits through the same debounced pipeline", async () => {
    const { editor } = await renderEditor();

    const input = screen.getByLabelText("documents:editor.titleLabel");
    act(() => {
      input.focus();
    });
    act(() => {
      fireEvent.change(input, { target: { value: "Renamed doc" } });
    });
    typeText(editor, "z");

    await advance(700);

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const payload = mutateAsync.mock.calls[0]?.[0];
    expect(payload.title).toBe("Renamed doc");
    expect(payload.content).toBeDefined();
  });

  it("opens the picker from /board and inserts the node at the slash position on select", async () => {
    const { editor } = await renderEditor();

    act(() => {
      editor.commands.focus("end");
    });
    typeText(editor, " /board");

    const item = await vi.waitFor(() =>
      screen.getByRole("button", {
        name: "tasks:detail.editor.slash.commands.board",
      }),
    );
    fireEvent.mouseDown(item);

    expect(pickerPropsRef.current?.open).toBe(true);
    expect(pickerPropsRef.current?.workspaceId).toBe("ws-1");
    // The slash range was deleted when the picker opened.
    expect(editor.getText()).not.toContain("/board");

    act(() => {
      pickerPropsRef.current?.onSelect("proj-1");
    });

    const json = editor.getJSON();
    expect((json.content ?? []).map((node) => node.type)).toEqual([
      "paragraph",
      "kaneoBoard",
    ]);
    expect(json.content?.[1]?.attrs).toMatchObject({
      projectId: "proj-1",
      view: "board",
    });
    expect(pickerPropsRef.current?.open).toBe(false);
  });

  it("cancelling the picker inserts nothing and leaves the slash text deleted", async () => {
    const { editor } = await renderEditor();

    act(() => {
      editor.commands.focus("end");
    });
    typeText(editor, " /board");

    const item = await vi.waitFor(() =>
      screen.getByRole("button", {
        name: "tasks:detail.editor.slash.commands.board",
      }),
    );
    fireEvent.mouseDown(item);
    expect(pickerPropsRef.current?.open).toBe(true);

    act(() => {
      pickerPropsRef.current?.onOpenChange(false);
    });

    expect(pickerPropsRef.current?.open).toBe(false);
    const json = JSON.stringify(editor.getJSON());
    expect(json).not.toContain("kaneoBoard");
    expect(editor.getText()).not.toContain("/board");
  });

  describe("drag handle", () => {
    it("renders the drag handle wired to the editor when editable", async () => {
      const { editor } = await renderEditor();

      expect(screen.getByTestId("drag-handle")).toBeInTheDocument();
      expect(dragHandleProps.current?.editor).toBe(editor);
      expect(typeof dragHandleProps.current?.onNodeChange).toBe("function");
    });

    it("does not render the drag handle for read-only viewers", async () => {
      permissions.canUpdateDocuments.mockReturnValue(false);

      await renderEditor();

      expect(screen.queryByTestId("drag-handle")).toBeNull();
      expect(dragHandleProps.current).toBeNull();
    });

    it("labels the handle with the i18n aria-label and Alt+Arrow tooltip", async () => {
      await renderEditor();

      const grip = screen.getByLabelText("documents:editor.dragHandle.label");
      expect(grip).toBeInTheDocument();
      expect(grip).toHaveAttribute(
        "title",
        "documents:editor.dragHandle.tooltip",
      );
    });

    it("hides the handle while hovering a kaneoBoard block and shows it again for a paragraph", async () => {
      const { editor } = await renderEditor();

      expect(screen.getByTestId("drag-handle")).not.toHaveClass("is-hidden");

      act(() => {
        dragHandleProps.current?.onNodeChange?.({
          editor,
          node: { type: { name: "kaneoBoard" } },
          pos: 0,
        });
      });
      expect(screen.getByTestId("drag-handle")).toHaveClass("is-hidden");

      act(() => {
        dragHandleProps.current?.onNodeChange?.({
          editor,
          node: { type: { name: "paragraph" } },
          pos: 0,
        });
      });
      expect(screen.getByTestId("drag-handle")).not.toHaveClass("is-hidden");
    });

    it("hides the handle while the slash menu is open", async () => {
      const { editor } = await renderEditor();

      act(() => {
        editor.commands.focus("end");
      });
      typeText(editor, " /");

      await vi.waitFor(() => {
        expect(screen.getByTestId("drag-handle")).toHaveClass("is-hidden");
      });

      // Escape closes the slash menu; the handle becomes available again.
      act(() => {
        fireEvent.keyDown(window, { key: "Escape" });
      });
      expect(screen.getByTestId("drag-handle")).not.toHaveClass("is-hidden");
    });
  });
});
