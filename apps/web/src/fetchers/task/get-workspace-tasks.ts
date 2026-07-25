import { client } from "@kaneo/libs";

export type WorkspaceTasksSortBy =
  | "dueDate"
  | "priority"
  | "createdAt"
  | "title";

export type GetWorkspaceTasksParams = {
  workspaceId: string;
  assigneeId?: string;
  status?: string;
  priority?: string;
  dueBefore?: string;
  dueAfter?: string;
  noDueDate?: boolean;
  sortBy?: WorkspaceTasksSortBy;
  page?: number;
  limit?: number;
};

async function getWorkspaceTasks({
  workspaceId,
  assigneeId,
  status,
  priority,
  dueBefore,
  dueAfter,
  noDueDate,
  sortBy,
  page,
  limit,
}: GetWorkspaceTasksParams) {
  const response = await client.task["workspace-tasks"].$get({
    query: {
      workspaceId,
      ...(assigneeId ? { assigneeId } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(dueBefore ? { dueBefore } : {}),
      ...(dueAfter ? { dueAfter } : {}),
      ...(noDueDate ? { noDueDate: "true" } : {}),
      ...(sortBy ? { sortBy } : {}),
      ...(page ? { page: String(page) } : {}),
      ...(limit ? { limit: String(limit) } : {}),
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

export type WorkspaceTasksResponse = Awaited<
  ReturnType<typeof getWorkspaceTasks>
>;
export type WorkspaceTaskRow = WorkspaceTasksResponse["data"][number];

export default getWorkspaceTasks;
