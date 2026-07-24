import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/lib/toast";
import { BoardPickerDialog } from "./board-picker-dialog";

const useProjectsMock = vi.fn();
const useCreateProjectMock = vi.fn();
const mutateAsync = vi.fn();
const permissions = {
  canCreateProjects: vi.fn(() => true),
};

// The Dialog primitive imports @/lib/i18n, which initializes the real
// i18next instance, so the mock must also provide initReactI18next.
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: (args: { workspaceId: string }) => useProjectsMock(args),
}));

vi.mock("@/hooks/mutations/project/use-create-project", () => ({
  default: (args: unknown) => useCreateProjectMock(args),
}));

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => permissions,
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

type Project = { id: string; name: string; slug: string };

const alpha: Project = { id: "p-alpha", name: "Alpha", slug: "ALP" };
const beta: Project = { id: "p-beta", name: "Beta", slug: "BET" };

function mockProjects(projects: Project[] | undefined, extra = {}) {
  useProjectsMock.mockReturnValue({
    data: projects,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...extra,
  });
}

function renderPicker() {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BoardPickerDialog
        onOpenChange={onOpenChange}
        onSelect={onSelect}
        open
        workspaceId="ws-1"
      />
    </QueryClientProvider>,
  );
  return { onSelect, onOpenChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.canCreateProjects.mockReturnValue(true);
  useCreateProjectMock.mockImplementation(() => ({
    mutateAsync,
    isPending: false,
  }));
  mutateAsync.mockResolvedValue({ id: "p-new" });
  mockProjects([alpha, beta]);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("BoardPickerDialog", () => {
  it("lists workspace projects and selecting one calls onSelect with its id", async () => {
    const { onSelect } = renderPicker();

    fireEvent.click(await screen.findByRole("button", { name: /Alpha/ }));

    expect(onSelect).toHaveBeenCalledWith("p-alpha");
  });

  it("shows a distinct no-results message when the search matches nothing", async () => {
    renderPicker();

    fireEvent.change(
      await screen.findByPlaceholderText(
        "documents:boardPicker.searchPlaceholder",
      ),
      { target: { value: "zzz" } },
    );

    expect(screen.getByText("documents:boardPicker.noResults")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Alpha/ })).toBeNull();
  });

  it("prompts straight into create mode for a workspace with zero projects", async () => {
    mockProjects([]);

    renderPicker();

    expect(
      await screen.findByText("documents:boardPicker.create.prompt"),
    ).toBeVisible();
    expect(
      screen.getByPlaceholderText(
        "documents:boardPicker.create.namePlaceholder",
      ),
    ).toBeVisible();
  });

  it("hides create mode from members without project:create", async () => {
    permissions.canCreateProjects.mockReturnValue(false);

    renderPicker();

    expect(await screen.findByRole("button", { name: /Alpha/ })).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "documents:boardPicker.createButton",
      }),
    ).toBeNull();

    // Zero projects without create rights: empty message, no create form.
    cleanup();
    mockProjects([]);
    renderPicker();
    expect(
      await screen.findByText("documents:boardPicker.empty"),
    ).toBeVisible();
    expect(
      screen.queryByPlaceholderText(
        "documents:boardPicker.create.namePlaceholder",
      ),
    ).toBeNull();
  });

  it("creates a project with name + generated key + workspaceId and selects it", async () => {
    const { onSelect } = renderPicker();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "documents:boardPicker.createButton",
      }),
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "documents:boardPicker.create.namePlaceholder",
      ),
      { target: { value: "Test Board" } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "documents:boardPicker.create.submit",
      }),
    );

    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith("p-new");
    });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    // The mutation hook captures its payload at call time.
    expect(useCreateProjectMock).toHaveBeenLastCalledWith({
      name: "Test Board",
      slug: "TB",
      workspaceId: "ws-1",
      icon: "Layout",
    });
  });

  it("keeps the dialog open in create mode with an inline error on failure", async () => {
    mutateAsync.mockRejectedValue(new Error("key already taken"));
    const { onSelect, onOpenChange } = renderPicker();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "documents:boardPicker.createButton",
      }),
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "documents:boardPicker.create.namePlaceholder",
      ),
      { target: { value: "Test Board" } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "documents:boardPicker.create.submit",
      }),
    );

    expect(await screen.findByText("key already taken")).toBeVisible();
    expect(toast.error).toHaveBeenCalledWith("key already taken");
    expect(onSelect).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // Still in create mode.
    expect(
      screen.getByPlaceholderText(
        "documents:boardPicker.create.namePlaceholder",
      ),
    ).toBeVisible();
  });
});
