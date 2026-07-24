import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import getTasks from "@/fetchers/task/get-tasks";

const DEFAULT_REFETCH_INTERVAL = 30000;

type TasksQueryOptions = Pick<
  UseQueryOptions<Awaited<ReturnType<typeof getTasks>>>,
  "refetchInterval"
>;

export function useGetTasks(projectId: string, options?: TasksQueryOptions) {
  return useQuery({
    queryKey: ["tasks", projectId],
    queryFn: () => getTasks(projectId),
    refetchInterval: options?.refetchInterval ?? DEFAULT_REFETCH_INTERVAL,
    enabled: !!projectId,
  });
}
