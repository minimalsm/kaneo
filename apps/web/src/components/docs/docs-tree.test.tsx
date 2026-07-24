import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocsTree } from "./docs-tree";
import type { DocumentListItem } from "./document-types";

const navigate = vi.fn();
const useDocumentsMock = vi.fn();
const createMutateAsync = vi.fn();
const updateMutate = vi.fn();
const moveMutate = vi.fn();
const archiveMutate = vi.fn();
const deleteMutate = vi.fn();
const permissions = {
  canCreateDocuments: vi.fn(() => true),
  canUpdateDocuments: vi.fn(() => true),
  canDeleteDocuments: vi.fn(() => true),
};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/queries/document/use-documents", () => ({
  default: (args: { workspaceId: string; archived?: boolean }) =>
    useDocumentsMock(args),
}));

vi.mock("@/hooks/mutations/document/use-create-document", () => ({
  default: () => ({ mutateAsync: createMutateAsync }),
}));

vi.mock("@/hooks/mutations/document/use-update-document", () => ({
  default: () => ({ mutate: updateMutate }),
}));

vi.mock("@/hooks/mutations/document/use-move-document", () => ({
  default: () => ({ mutate: moveMutate }),
}));

vi.mock("@/hooks/mutations/document/use-archive-document", () => ({
  default: () => ({ mutate: archiveMutate }),
}));

vi.mock("@/hooks/mutations/document/use-delete-document", () => ({
  default: () => ({ mutate: deleteMutate }),
}));

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => permissions,
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function doc(
  id: string,
  parentId: string | null,
  sortOrder: number,
  title = `Doc ${id}`,
): DocumentListItem {
  return {
    id,
    parentId,
    sortOrder,
    title,
    projectId: null,
    icon: null,
    archivedAt: null,
    createdBy: "user-1",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
  } as unknown as DocumentListItem;
}

function mockDocuments(
  active: DocumentListItem[],
  archived: DocumentListItem[] = [],
) {
  useDocumentsMock.mockImplementation(
    ({ archived: wantArchived }: { archived?: boolean }) => ({
      data: wantArchived ? archived : active,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.canCreateDocuments.mockReturnValue(true);
  permissions.canUpdateDocuments.mockReturnValue(true);
  permissions.canDeleteDocuments.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("DocsTree", () => {
  it("renders the create-first-doc call-to-action for an empty workspace", () => {
    mockDocuments([]);

    render(<DocsTree workspaceId="ws-1" />);

    expect(screen.getByText("documents:empty.title")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /documents:empty\.action/ }),
    ).toBeVisible();
  });

  it("creates the first doc from the call-to-action and navigates to it", async () => {
    mockDocuments([]);
    createMutateAsync.mockResolvedValue({ id: "new-doc" });

    render(<DocsTree workspaceId="ws-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: /documents:empty\.action/ }),
    );

    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/dashboard/workspace/$workspaceId/docs/$documentId",
        params: { workspaceId: "ws-1", documentId: "new-doc" },
      });
    });
    expect(createMutateAsync).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      parentId: undefined,
    });
  });

  it("creates a child under the right parent and navigates to it", async () => {
    mockDocuments([doc("parent", null, 0), doc("other", null, 1)]);
    createMutateAsync.mockResolvedValue({ id: "child-doc" });

    render(<DocsTree workspaceId="ws-1" />);

    const parentItem = screen.getByRole("treeitem", { name: /Doc parent/ });
    fireEvent.click(
      // biome-ignore lint/style/noNonNullAssertion: menu trigger exists for editors
      parentItem.querySelector(
        "button[aria-label='documents:tree.actions.menu']",
      )!,
    );
    fireEvent.click(
      await screen.findByText("documents:tree.actions.createChild"),
    );

    await vi.waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        parentId: "parent",
      });
    });
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/dashboard/workspace/$workspaceId/docs/$documentId",
        params: { workspaceId: "ws-1", documentId: "child-doc" },
      });
    });
  });

  it("archiving a node calls the mutation and the refetched tree drops the subtree", async () => {
    const parent = doc("parent", null, 0);
    const child = doc("child", "parent", 0);
    const other = doc("other", null, 1);
    mockDocuments([parent, child, other]);

    const { rerender } = render(
      <DocsTree selectedDocumentId="parent" workspaceId="ws-1" />,
    );

    // Child is visible once the parent is expanded.
    fireEvent.click(
      // biome-ignore lint/style/noNonNullAssertion: the expandable parent renders a chevron
      screen.getAllByRole("button", { name: "documents:tree.expand" })[0]!,
    );
    expect(screen.getByText("Doc child")).toBeVisible();

    const parentItem = screen.getByRole("treeitem", { name: /Doc parent/ });
    fireEvent.click(
      // biome-ignore lint/style/noNonNullAssertion: menu trigger exists for editors
      parentItem.querySelector(
        "button[aria-label='documents:tree.actions.menu']",
      )!,
    );
    fireEvent.click(await screen.findByText("documents:tree.actions.archive"));

    expect(archiveMutate).toHaveBeenCalledWith(
      { id: "parent" },
      expect.anything(),
    );

    // Simulate the invalidated list refetch: archived subtree is gone.
    mockDocuments([other]);
    rerender(<DocsTree selectedDocumentId="parent" workspaceId="ws-1" />);

    expect(screen.queryByText("Doc parent")).toBeNull();
    expect(screen.queryByText("Doc child")).toBeNull();
    expect(screen.getByText("Doc other")).toBeVisible();
  });

  it("shows no create, rename, or archive affordances to viewers", () => {
    permissions.canCreateDocuments.mockReturnValue(false);
    permissions.canUpdateDocuments.mockReturnValue(false);
    permissions.canDeleteDocuments.mockReturnValue(false);
    mockDocuments([doc("parent", null, 0)]);

    render(<DocsTree workspaceId="ws-1" />);

    expect(screen.getByRole("treeitem", { name: /Doc parent/ })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "documents:tree.createDocument" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "documents:tree.actions.menu" }),
    ).toBeNull();
  });

  it("viewer sees no create call-to-action in an empty workspace", () => {
    permissions.canCreateDocuments.mockReturnValue(false);
    permissions.canUpdateDocuments.mockReturnValue(false);
    permissions.canDeleteDocuments.mockReturnValue(false);
    mockDocuments([]);

    render(<DocsTree workspaceId="ws-1" />);

    expect(screen.getByText("documents:empty.title")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /documents:empty\.action/ }),
    ).toBeNull();
  });

  it("renames a doc via the inline input on Enter", async () => {
    mockDocuments([doc("parent", null, 0)]);

    render(<DocsTree workspaceId="ws-1" />);

    const parentItem = screen.getByRole("treeitem", { name: /Doc parent/ });
    fireEvent.click(
      // biome-ignore lint/style/noNonNullAssertion: menu trigger exists for editors
      parentItem.querySelector(
        "button[aria-label='documents:tree.actions.menu']",
      )!,
    );
    fireEvent.click(await screen.findByText("documents:tree.actions.rename"));

    const input = await screen.findByLabelText("documents:tree.renameLabel");
    fireEvent.change(input, { target: { value: "Renamed doc" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(updateMutate).toHaveBeenCalledWith(
      { id: "parent", title: "Renamed doc" },
      expect.anything(),
    );
  });
});
