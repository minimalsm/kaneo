import { useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import useCreateProject from "@/hooks/mutations/project/use-create-project";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import generateProjectSlug from "@/lib/generate-project-id";

// Matches create-project-modal's default icon.
const DEFAULT_PROJECT_ICON = "Layout";

type BoardPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onSelect: (projectId: string) => void;
};

export function BoardPickerDialog({
  open,
  onOpenChange,
  workspaceId,
  onSelect,
}: BoardPickerDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Fetch only while the dialog is open (the hook is disabled on falsy ids).
  const {
    data: projects,
    isLoading,
    isError,
    refetch,
  } = useGetProjects({ workspaceId: open ? workspaceId : "" });
  const { canCreateProjects } = useWorkspacePermission();
  const canCreate = canCreateProjects();

  const trimmedName = createName.trim();
  const { mutateAsync: createProject, isPending: isCreatePending } =
    useCreateProject({
      name: trimmedName,
      slug: generateProjectSlug(trimmedName),
      workspaceId,
      icon: DEFAULT_PROJECT_ICON,
    });

  // Reset transient state whenever the dialog closes, however that happens
  // (Escape, backdrop, select, cancel) — the parent only toggles `open`.
  useEffect(() => {
    if (open) return;
    setSearch("");
    setIsCreating(false);
    setCreateName("");
    setCreateError(null);
  }, [open]);

  const projectList = projects ?? [];
  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return projectList;
    return projectList.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        (project.slug ?? "").toLowerCase().includes(query),
    );
  }, [projectList, search]);

  const hasNoProjects = !isLoading && !isError && projectList.length === 0;
  const showCreateForm = canCreate && (isCreating || hasNoProjects);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmedName || isCreatePending) return;
    setCreateError(null);
    try {
      const { id } = await createProject();
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      onSelect(id);
    } catch (error) {
      setCreateError(
        error instanceof Error && error.message
          ? error.message
          : t("documents:boardPicker.create.error"),
      );
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("documents:boardPicker.title")}</DialogTitle>
          <DialogDescription>
            {t("documents:boardPicker.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {isLoading && (
            <div aria-hidden="true" className="flex flex-col gap-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-2/3" />
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="text-destructive-foreground">
                {t("documents:boardPicker.loadFailed")}
              </p>
              <Button
                onClick={() => void refetch()}
                size="xs"
                variant="outline"
              >
                <RefreshCw />
                {t("common:error.tryAgain")}
              </Button>
            </div>
          )}

          {hasNoProjects && !canCreate && (
            <p className="p-2 text-muted-foreground text-sm">
              {t("documents:boardPicker.empty")}
            </p>
          )}

          {showCreateForm ? (
            <form className="flex flex-col gap-3" onSubmit={handleCreate}>
              {hasNoProjects && (
                <p className="text-muted-foreground text-sm">
                  {t("documents:boardPicker.create.prompt")}
                </p>
              )}
              <Input
                aria-label={t("documents:boardPicker.create.nameLabel")}
                autoFocus
                onChange={(event) => setCreateName(event.target.value)}
                placeholder={t("documents:boardPicker.create.namePlaceholder")}
                value={createName}
              />
              {createError && (
                <p className="text-destructive text-sm" role="alert">
                  {createError}
                </p>
              )}
              <DialogFooter className="px-0 pb-0">
                {!hasNoProjects && (
                  <Button
                    onClick={() => {
                      setIsCreating(false);
                      setCreateError(null);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("documents:boardPicker.create.back")}
                  </Button>
                )}
                <Button
                  disabled={!trimmedName || isCreatePending}
                  size="sm"
                  type="submit"
                >
                  {t("documents:boardPicker.create.submit")}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            !isLoading &&
            !isError &&
            projectList.length > 0 && (
              <div className="flex flex-col gap-2">
                <Input
                  aria-label={t("documents:boardPicker.searchLabel")}
                  autoFocus
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("documents:boardPicker.searchPlaceholder")}
                  value={search}
                />
                {filteredProjects.length > 0 ? (
                  <ul
                    aria-label={t("documents:boardPicker.listLabel")}
                    className="m-0 flex max-h-64 list-none flex-col gap-0.5 overflow-y-auto p-0"
                  >
                    {filteredProjects.map((project) => (
                      <li key={project.id}>
                        <button
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/50"
                          onClick={() => onSelect(project.id)}
                          type="button"
                        >
                          <span className="min-w-0 flex-1 truncate text-foreground">
                            {project.name}
                          </span>
                          <span className="shrink-0 text-muted-foreground text-xs">
                            {project.slug}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-2 text-muted-foreground text-sm">
                    {t("documents:boardPicker.noResults")}
                  </p>
                )}
                {canCreate && (
                  <Button
                    className="justify-start text-muted-foreground"
                    onClick={() => setIsCreating(true)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Plus className="size-3.5" />
                    {t("documents:boardPicker.createButton")}
                  </Button>
                )}
              </div>
            )
          )}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
