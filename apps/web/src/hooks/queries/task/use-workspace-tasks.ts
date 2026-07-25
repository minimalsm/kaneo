import { useInfiniteQuery } from "@tanstack/react-query";
import getWorkspaceTasks, {
  type GetWorkspaceTasksParams,
} from "@/fetchers/task/get-workspace-tasks";

export type WorkspaceTasksQueryFilters = Omit<
  GetWorkspaceTasksParams,
  "workspaceId" | "page"
>;

export function useWorkspaceTasks(
  workspaceId: string,
  filters: WorkspaceTasksQueryFilters,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey: ["workspace-tasks", workspaceId, filters],
    queryFn: ({ pageParam }) =>
      getWorkspaceTasks({ workspaceId, ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    enabled: !!workspaceId && (options?.enabled ?? true),
  });
}

export default useWorkspaceTasks;
