import { act, cleanup, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocEditor } from "./doc-editor";

// Integration smoke: unlike doc-editor.test.tsx, this file does NOT mock
// @tiptap/extension-drag-handle-react — the real component must mount, which
// registers the real drag-handle ProseMirror plugin (duplicate-PluginKey
// crashes, floating-ui positioning, portal rendering all run for real).

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

vi.mock("./doc-version-history", () => ({
  DocVersionHistory: () => null,
}));

// The board embed node view mounts router-coupled hooks; it has its own
// colocated tests.
vi.mock("./doc-board-embed", async () => {
  const { NodeViewWrapper } = await import("@tiptap/react");
  return {
    DocBoardEmbed: () => <NodeViewWrapper data-testid="doc-board-embed-stub" />,
  };
});

vi.mock("./board-picker-dialog", () => ({
  BoardPickerDialog: () => null,
}));

// Floating-UI positioning of the bubble menu is not under test here.
vi.mock("@tiptap/react/menus", () => ({
  BubbleMenu: () => null,
}));

// Minimal layout polyfills so ProseMirror's view and floating-ui can run
// under jsdom (same set as doc-editor.test.tsx).
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

function makeDoc() {
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.canUpdateDocuments.mockReturnValue(true);
  mutateAsync.mockResolvedValue(makeDoc());
  useDocumentMock.mockReturnValue({
    data: makeDoc(),
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("DocEditor with the real DragHandle", () => {
  it("mounts the lazy DragHandle and registers its plugin without throwing", async () => {
    const editorRef: { current: Editor | null } = { current: null };

    render(
      <DocEditor
        documentId="doc-1"
        onEditorReady={(editor) => {
          editorRef.current = editor;
        }}
      />,
    );
    await vi.waitFor(() => {
      expect(editorRef.current).toBeTruthy();
    });
    // Flush readiness state, hydration, and the lazy chunk resolution.
    await act(async () => {});

    // The real component portals the grip into the document once the lazy
    // chunk resolves and the ProseMirror plugin registers.
    const grip = await screen.findByLabelText(
      "documents:editor.dragHandle.label",
    );
    expect(grip).toBeInTheDocument();

    // Editor stayed healthy alongside the real plugin: content rendered and
    // commands still dispatch.
    expect(screen.getByText("Hello stored world")).toBeInTheDocument();
    act(() => {
      editorRef.current?.commands.insertContentAt(0, {
        type: "paragraph",
        content: [{ type: "text", text: "still alive" }],
      });
    });
    expect(screen.getByText("still alive")).toBeInTheDocument();
  });
});
