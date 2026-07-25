import { useNavigate, useSearch } from "@tanstack/react-router";
import { CheckSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Button } from "@/components/ui/button";
import icons from "@/constants/project-icons";
import type { WorkspaceTaskRow as WorkspaceTaskRowData } from "@/fetchers/task/get-workspace-tasks";
import {
  useWorkspaceTasks,
  type WorkspaceTasksQueryFilters,
} from "@/hooks/queries/task/use-workspace-tasks";
import { useUserPreferencesStore } from "@/store/user-preferences";
import WorkspaceTaskRow from "./workspace-task-row";
import WorkspaceTasksFilterBar from "./workspace-tasks-filter-bar";
import {
  buildDueBounds,
  isDefaultWorkspaceTasksFilters,
  loadWorkspaceTasksFilters,
  saveWorkspaceTasksFilters,
  type WorkspaceTasksFilters,
} from "./workspace-tasks-filters";

type WorkspaceTasksViewProps = {
  workspaceId: string;
};

type ProjectGroup = {
  projectId: string;
  projectName: string;
  projectIcon: string | null;
  tasks: WorkspaceTaskRowData[];
};

function groupByProject(rows: WorkspaceTaskRowData[]): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();
  for (const row of rows) {
    let group = groups.get(row.projectId);
    if (!group) {
      group = {
        projectId: row.projectId,
        projectName: row.projectName,
        projectIcon: row.projectIcon,
        tasks: [],
      };
      groups.set(row.projectId, group);
    }
    group.tasks.push(row);
  }
  return [...groups.values()];
}

function LoadingSkeleton() {
  return (
    <div
      className="space-y-2 p-4"
      data-testid="workspace-tasks-loading"
      aria-busy="true"
    >
      {["a", "b", "c", "d", "e"].map((key) => (
        <div
          key={key}
          className="h-8 animate-pulse rounded-md bg-muted/60"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export function WorkspaceTasksView({ workspaceId }: WorkspaceTasksViewProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { taskId?: string };
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);

  const [filters, setFilters] = useState<WorkspaceTasksFilters>(() =>
    loadWorkspaceTasksFilters(workspaceId),
  );

  useEffect(() => {
    setFilters(loadWorkspaceTasksFilters(workspaceId));
  }, [workspaceId]);

  const handleFiltersChange = useCallback(
    (next: WorkspaceTasksFilters) => {
      setFilters(next);
      saveWorkspaceTasksFilters(workspaceId, next);
    },
    [workspaceId],
  );

  const queryFilters = useMemo<WorkspaceTasksQueryFilters>(() => {
    const assigneeId =
      filters.assignee === "me"
        ? user?.id
        : filters.assignee === "everyone"
          ? undefined
          : filters.assignee;

    return {
      ...(assigneeId ? { assigneeId } : {}),
      ...(filters.status !== "all" ? { status: filters.status } : {}),
      ...(filters.priority !== "all" ? { priority: filters.priority } : {}),
      ...buildDueBounds(filters.due, weekStartsOn),
      sortBy: filters.sortBy,
    };
  }, [filters, user?.id, weekStartsOn]);

  const canQuery = filters.assignee !== "me" || !!user?.id;

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useWorkspaceTasks(workspaceId, queryFilters, { enabled: canQuery });

  const rows = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  );
  const groups = useMemo(() => groupByProject(rows), [rows]);

  const openTask = useCallback(
    (task: WorkspaceTaskRowData) => {
      navigate({ to: ".", search: { taskId: task.id } });
    },
    [navigate],
  );

  const closeTask = useCallback(() => {
    navigate({ to: ".", search: {}, replace: true });
  }, [navigate]);

  const selectedTask = useMemo(
    () => rows.find((row) => row.id === search.taskId),
    [rows, search.taskId],
  );

  const isEmptyDefault =
    rows.length === 0 && isDefaultWorkspaceTasksFilters(filters);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkspaceTasksFilterBar
        workspaceId={workspaceId}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading || !canQuery ? (
          <LoadingSkeleton />
        ) : isError ? (
          <div
            className="flex flex-col items-center gap-3 p-8 text-center"
            data-testid="workspace-tasks-error"
          >
            <p className="text-sm text-muted-foreground">
              {t("workspaceTasks:error.description")}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {t("workspaceTasks:error.retry")}
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2 p-8 text-center"
            data-testid="workspace-tasks-empty"
          >
            <CheckSquare className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {isEmptyDefault
                ? t("workspaceTasks:empty.assignedToMe")
                : t("workspaceTasks:empty.noMatch")}
            </p>
          </div>
        ) : (
          <>
            {groups.map((group) => {
              const IconComponent =
                icons[group.projectIcon as keyof typeof icons] || icons.Layout;
              return (
                <section key={group.projectId}>
                  <h3 className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/50 bg-background/95 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                    <IconComponent className="h-3.5 w-3.5" />
                    <span className="truncate">{group.projectName}</span>
                    <span className="text-muted-foreground/60">
                      {group.tasks.length}
                    </span>
                  </h3>
                  {group.tasks.map((task) => (
                    <WorkspaceTaskRow
                      key={task.id}
                      task={task}
                      onOpen={openTask}
                    />
                  ))}
                </section>
              );
            })}
            {hasNextPage && (
              <div className="flex justify-center p-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                >
                  {t("workspaceTasks:loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      {search.taskId && selectedTask ? (
        <TaskDetailsSheet
          taskId={search.taskId}
          projectId={selectedTask.projectId}
          workspaceId={workspaceId}
          onClose={closeTask}
        />
      ) : null}
    </div>
  );
}

export default WorkspaceTasksView;
