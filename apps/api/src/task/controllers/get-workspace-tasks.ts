import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNull,
  lte,
  ne,
  type SQL,
  sql,
} from "drizzle-orm";
import db from "../../database";
import { projectTable, taskTable, userTable } from "../../database/schema";
import {
  fetchTaskLabelsAndLinks,
  priorityCaseExpr,
} from "../task-query-helpers";

type GetWorkspaceTasksOptions = {
  assigneeId?: string;
  dueAfter?: string;
  dueBefore?: string;
  noDueDate?: string;
  limit?: number;
  page?: number;
  priority?: string;
  sortBy?: "createdAt" | "priority" | "dueDate" | "title";
  sortOrder?: "asc" | "desc";
  status?: string;
};

function buildSortExpr(
  sortBy: GetWorkspaceTasksOptions["sortBy"],
  sortOrder: GetWorkspaceTasksOptions["sortOrder"],
): SQL {
  const direction = sortOrder === "desc" ? desc : asc;

  switch (sortBy) {
    case "createdAt":
      return direction(taskTable.createdAt);
    case "priority":
      return direction(priorityCaseExpr);
    case "title":
      return direction(taskTable.title);
    default:
      return direction(taskTable.dueDate);
  }
}

async function getWorkspaceTasks(
  workspaceId: string,
  options: GetWorkspaceTasksOptions = {},
) {
  const conditions = [eq(projectTable.workspaceId, workspaceId)];

  if (options.status) {
    conditions.push(eq(taskTable.status, options.status));
  } else {
    conditions.push(ne(taskTable.status, "archived"));
  }

  if (options.priority) {
    conditions.push(eq(taskTable.priority, options.priority));
  }

  if (options.assigneeId === "unassigned") {
    conditions.push(isNull(taskTable.userId));
  } else if (options.assigneeId) {
    conditions.push(eq(taskTable.userId, options.assigneeId));
  }

  if (options.noDueDate === "true") {
    conditions.push(isNull(taskTable.dueDate));
  } else if (options.dueBefore || options.dueAfter) {
    if (options.dueBefore) {
      conditions.push(lte(taskTable.dueDate, new Date(options.dueBefore)));
    }
    if (options.dueAfter) {
      conditions.push(gte(taskTable.dueDate, new Date(options.dueAfter)));
    }
  }

  const whereClause = and(...conditions);
  const page = options.page && options.page > 0 ? options.page : 1;
  const pageSize =
    options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 50;
  const offset = (page - 1) * pageSize;

  const sortExpr = buildSortExpr(
    options.sortBy ?? "dueDate",
    options.sortOrder ?? "asc",
  );

  const [taskCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(whereClause);

  const total = Number(taskCount?.count ?? 0);

  const rows = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      number: taskTable.number,
      description: taskTable.description,
      status: taskTable.status,
      priority: taskTable.priority,
      startDate: taskTable.startDate,
      dueDate: taskTable.dueDate,
      createdAt: taskTable.createdAt,
      userId: taskTable.userId,
      assigneeId: userTable.id,
      assigneeName: userTable.name,
      assigneeImage: userTable.image,
      projectId: taskTable.projectId,
      projectSlug: projectTable.slug,
      projectName: projectTable.name,
      projectIcon: projectTable.icon,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(userTable, eq(taskTable.userId, userTable.id))
    .where(whereClause)
    .orderBy(asc(projectTable.name), sortExpr)
    .limit(pageSize)
    .offset(offset);

  const taskIds = rows.map((task) => task.id);

  const { taskLabelsMap, taskExternalLinksMap } =
    await fetchTaskLabelsAndLinks(taskIds);

  return {
    data: rows.map((task) => ({
      ...task,
      labels: taskLabelsMap.get(task.id) || [],
      externalLinks: taskExternalLinksMap.get(task.id) || [],
    })),
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export default getWorkspaceTasks;
