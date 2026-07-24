import { useQuery } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { GripVertical, LayoutGrid, List } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import KanbanBoard from "@/components/kanban-board";
import ListView from "@/components/list-view";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import getTasks from "@/fetchers/task/get-tasks";
import useGetProject from "@/hooks/queries/project/use-get-project";
import { cn } from "@/lib/cn";

// Fixed embed body height (KTD6): the board assumes h-full flex layouts, so
// the embed gives it a bounded viewport with internal scroll.
const EMBED_BODY_HEIGHT_CLASS = "h-[480px]";

const TASKS_REFETCH_INTERVAL = 30000;

type EmbedView = "board" | "list";

// Same queryKey + fetcher as useGetTasks so task mutations still invalidate
// this query, but with polling disabled while errored (KTD4) so a no-access
// embed does not hammer a 403 behind its placeholder.
function useEmbedTasks(projectId: string) {
  return useQuery({
    queryKey: ["tasks", projectId],
    queryFn: () => getTasks(projectId),
    refetchInterval: (query) =>
      query.state.status === "error" ? false : TASKS_REFETCH_INTERVAL,
    enabled: !!projectId,
  });
}

function EmbedSkeleton() {
  return (
    <div
      className="flex h-full w-full gap-4 overflow-hidden p-4"
      data-testid="doc-board-embed-skeleton"
    >
      {["col-a", "col-b", "col-c"].map((col) => (
        <div key={col} className="flex w-64 shrink-0 flex-col gap-3">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="flex flex-col gap-2.5">
            {[0, 1, 2].map((i) => (
              <div
                key={`${col}-${i}`}
                className="space-y-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
                <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DocBoardEmbed({
  node,
  editor,
  updateAttributes,
  getPos,
}: NodeViewProps) {
  const projectId = String(node.attrs.projectId || "");
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workspaceId = "" } = useParams({ strict: false });
  const search = useSearch({ strict: false }) as { taskId?: string };

  const { data: project, isError } = useEmbedTasks(projectId);
  const { data: projectMeta } = useGetProject({ id: projectId, workspaceId });

  const attrView: EmbedView = node.attrs.view === "list" ? "list" : "board";
  const [localView, setLocalView] = useState<EmbedView>(attrView);
  const view = editor.isEditable ? attrView : localView;

  const setView = useCallback(
    (next: EmbedView) => {
      if (editor.isEditable) {
        updateAttributes({ view: next });
      } else {
        setLocalView(next);
      }
    },
    [editor.isEditable, updateAttributes],
  );

  const selectNode = useCallback(() => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (typeof pos === "number") {
      editor.commands.setNodeSelection(pos);
    }
  }, [editor, getPos]);

  const projectTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const column of project?.columns ?? []) {
      for (const task of column.tasks) {
        ids.add(task.id);
      }
    }
    return ids;
  }, [project]);

  const openTaskId =
    search.taskId && projectTaskIds.has(search.taskId)
      ? search.taskId
      : undefined;

  const handleCloseTaskSheet = useCallback(() => {
    navigate({ to: ".", search: {}, replace: true });
  }, [navigate]);

  const projectName = projectMeta?.name ?? project?.name ?? "";

  const viewToggle = (
    [
      {
        key: "board",
        icon: LayoutGrid,
        label: t("documents:boardEmbed.view.board"),
      },
      { key: "list", icon: List, label: t("documents:boardEmbed.view.list") },
    ] as const
  ).map(({ key, icon: Icon, label }) => (
    <button
      key={key}
      type="button"
      aria-label={label}
      aria-pressed={view === key}
      onClick={(event) => {
        event.stopPropagation();
        setView(key);
      }}
      className={cn(
        "rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        view === key && "bg-muted text-foreground",
      )}
    >
      <Icon className="size-3.5" />
    </button>
  ));

  return (
    <NodeViewWrapper
      className="kaneo-doc-board-embed my-3 w-full overflow-hidden rounded-lg border border-border bg-background"
      data-testid="doc-board-embed"
    >
      {/* The header is the node's selection surface: clicking it selects the
          atom so Backspace/Delete removes the block — the interactive board
          body cannot serve that role. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard node selection is handled by ProseMirror itself */}
      <div
        className="flex cursor-default items-center gap-1.5 border-border border-b px-2 py-1.5"
        contentEditable={false}
        data-testid="doc-board-embed-header"
        role="toolbar"
        aria-label={t("documents:boardEmbed.selectLabel")}
        onClick={selectNode}
      >
        <button
          type="button"
          className="cursor-grab text-muted-foreground"
          contentEditable={false}
          data-drag-handle
          aria-label={t("documents:boardEmbed.dragHandleLabel")}
        >
          <GripVertical className="size-4" />
        </button>
        <Link
          to="/dashboard/workspace/$workspaceId/project/$projectId/board"
          params={{ workspaceId, projectId }}
          aria-label={t("documents:boardEmbed.openProject")}
          className="truncate font-medium text-foreground text-sm hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {projectName || t("documents:boardEmbed.fallbackTitle")}
        </Link>
        <div className="ml-auto flex items-center gap-0.5">{viewToggle}</div>
      </div>
      <div
        className={cn(
          EMBED_BODY_HEIGHT_CLASS,
          "w-full overflow-auto bg-background",
        )}
        contentEditable={false}
        data-testid="doc-board-embed-body"
      >
        {isError ? (
          <div
            className="flex h-full items-center justify-center p-6"
            data-testid="doc-board-embed-error"
          >
            <p className="max-w-sm text-center text-muted-foreground text-sm">
              {t("documents:boardEmbed.unavailable")}
            </p>
          </div>
        ) : !project ? (
          <EmbedSkeleton />
        ) : view === "board" ? (
          <KanbanBoard project={project} disableShortcuts />
        ) : (
          <ListView project={project} disableShortcuts />
        )}
      </div>
      {openTaskId ? (
        <TaskDetailsSheet
          taskId={openTaskId}
          projectId={projectId}
          workspaceId={workspaceId}
          onClose={handleCloseTaskSheet}
        />
      ) : null}
    </NodeViewWrapper>
  );
}
