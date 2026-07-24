import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocVersionHistory } from "./doc-version-history";

const useVersionsMock = vi.fn();
const restoreMutate = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const permissions = {
  canUpdateDocuments: vi.fn(() => true),
};

// The Dialog primitive imports @/lib/i18n, which initializes the real
// i18next instance, so the mock must also provide initReactI18next.
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/queries/document/use-document-versions", () => ({
  default: (args: { id: string }) => useVersionsMock(args),
}));

vi.mock("@/hooks/mutations/document/use-restore-document-version", () => ({
  default: () => ({ mutate: restoreMutate, isPending: false }),
}));

vi.mock("@/hooks/queries/workspace-users/use-get-workspace-users", () => ({
  default: () => ({
    data: [
      { userId: "user-alice", user: { name: "Alice", email: "a@x.io" } },
      { userId: "user-bob", user: { name: "Bob", email: "b@x.io" } },
    ],
  }),
}));

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => permissions,
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

type Version = {
  id: string;
  documentId: string;
  createdBy: string;
  createdAt: string;
};

const newerVersion: Version = {
  id: "v-new",
  documentId: "doc-1",
  createdBy: "user-alice",
  createdAt: "2026-07-24T10:00:00.000Z",
};

const olderVersion: Version = {
  id: "v-old",
  documentId: "doc-1",
  createdBy: "user-bob",
  createdAt: "2026-07-01T10:00:00.000Z",
};

function mockVersions(versions: Version[] | undefined, extra = {}) {
  useVersionsMock.mockReturnValue({
    data: versions,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...extra,
  });
}

function openHistory() {
  render(<DocVersionHistory documentId="doc-1" workspaceId="ws-1" />);
  fireEvent.click(
    screen.getByRole("button", { name: /documents:versionHistory\.trigger/ }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.canUpdateDocuments.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("DocVersionHistory", () => {
  it("renders versions newest-first with their authors", async () => {
    // Deliberately oldest-first: the component must order them itself.
    mockVersions([olderVersion, newerVersion]);

    openHistory();

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("Alice");
    expect(items[1]?.textContent).toContain("Bob");
  });

  it("renders the empty state for a doc with zero versions", async () => {
    mockVersions([]);

    openHistory();

    expect(
      await screen.findByText("documents:versionHistory.empty.title"),
    ).toBeVisible();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("restores a version through the confirm dialog, toasts, and closes", async () => {
    mockVersions([newerVersion, olderVersion]);

    openHistory();

    const restoreButtons = await screen.findAllByRole("button", {
      name: /documents:versionHistory\.restore$/,
    });
    // biome-ignore lint/style/noNonNullAssertion: two versions render two restore buttons
    fireEvent.click(restoreButtons[1]!);

    expect(
      await screen.findByText("documents:versionHistory.restoreConfirm.title"),
    ).toBeVisible();
    // Nothing is mutated until the user confirms.
    expect(restoreMutate).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "documents:versionHistory.restoreConfirm.confirm",
      }),
    );

    expect(restoreMutate).toHaveBeenCalledWith(
      { id: "doc-1", versionId: "v-old" },
      expect.anything(),
    );

    const options = restoreMutate.mock.calls[0]?.[1] as {
      onSuccess: () => void;
    };
    act(() => {
      options.onSuccess();
    });

    expect(toastSuccess).toHaveBeenCalledWith(
      "documents:versionHistory.restoreSuccess",
    );
    await vi.waitFor(() => {
      expect(screen.queryByText("documents:versionHistory.title")).toBeNull();
    });
  });

  it("shows the list but no restore actions to viewers", async () => {
    permissions.canUpdateDocuments.mockReturnValue(false);
    mockVersions([newerVersion, olderVersion]);

    openHistory();

    expect(await screen.findAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.queryByRole("button", {
        name: /documents:versionHistory\.restore$/,
      }),
    ).toBeNull();
  });
});
