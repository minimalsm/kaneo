import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type WorkspaceTaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  dueDate: string | null;
  userId: string | null;
  assigneeName: string | null;
  projectId: string;
  projectSlug: string;
  projectName: string;
  projectIcon: string | null;
  labels: Array<{ id: string; name: string; color: string }>;
};

type WorkspaceTasksResponse = {
  data: WorkspaceTaskRow[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
};

// `task.number` defaults to 1 and is unique per project, so direct inserts
// must assign explicit numbers to seed more than one task in a project.
let seededTaskNumber = 0;

async function seedTask(
  projectId: string,
  overrides: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  seededTaskNumber += 1;
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      title: "Seeded Task",
      status: "to-do",
      number: seededTaskNumber,
      ...overrides,
    })
    .returning();
  return task;
}

async function fetchWorkspaceTasks(
  app: ReturnType<typeof createApp>["app"],
  workspaceId: string,
  params: Record<string, string> = {},
) {
  const search = new URLSearchParams({ workspaceId, ...params });
  return app.request(`/api/task/workspace-tasks?${search.toString()}`);
}

describe("API integration: workspace tasks", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("returns tasks from every project in the workspace and excludes other workspaces", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const other = await createWorkspaceMember({ role: "member" });
    const { project: projectA } = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Alpha",
    });
    const { project: projectB } = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Beta",
    });
    const { project: foreignProject } = await createProjectFixture({
      workspaceId: other.workspace.id,
      name: "Foreign",
    });
    const taskA = await seedTask(projectA.id, { title: "In Alpha" });
    const taskB = await seedTask(projectB.id, { title: "In Beta" });
    const foreignTask = await seedTask(foreignProject.id, {
      title: "Elsewhere",
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await fetchWorkspaceTasks(app, member.workspace.id);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as WorkspaceTasksResponse;
    const ids = payload.data.map((row) => row.id);
    expect(ids).toContain(taskA.id);
    expect(ids).toContain(taskB.id);
    expect(ids).not.toContain(foreignTask.id);
    expect(payload.pagination.total).toBe(2);
  });

  it("filters by assigneeId, returns only unassigned for the unassigned token, and everyone when absent", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const teammate = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const mine = await seedTask(project.id, {
      title: "Mine",
      userId: member.user.id,
    });
    const theirs = await seedTask(project.id, {
      title: "Theirs",
      userId: teammate.user.id,
    });
    const nobodys = await seedTask(project.id, { title: "Nobody's" });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const mineResponse = await fetchWorkspaceTasks(app, member.workspace.id, {
      assigneeId: member.user.id,
    });
    const minePayload = (await mineResponse.json()) as WorkspaceTasksResponse;
    expect(minePayload.data.map((row) => row.id)).toEqual([mine.id]);

    const unassignedResponse = await fetchWorkspaceTasks(
      app,
      member.workspace.id,
      { assigneeId: "unassigned" },
    );
    const unassignedPayload =
      (await unassignedResponse.json()) as WorkspaceTasksResponse;
    expect(unassignedPayload.data.map((row) => row.id)).toEqual([nobodys.id]);

    const everyoneResponse = await fetchWorkspaceTasks(
      app,
      member.workspace.id,
    );
    const everyonePayload =
      (await everyoneResponse.json()) as WorkspaceTasksResponse;
    expect(everyonePayload.data.map((row) => row.id).sort()).toEqual(
      [mine.id, theirs.id, nobodys.id].sort(),
    );
  });

  it("applies status, priority, and due-range filters with dueDate sorting", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const early = await seedTask(project.id, {
      title: "Early urgent",
      status: "in-progress",
      priority: "urgent",
      dueDate: new Date("2026-08-01T00:00:00.000Z"),
    });
    const late = await seedTask(project.id, {
      title: "Late urgent",
      status: "in-progress",
      priority: "urgent",
      dueDate: new Date("2026-08-20T00:00:00.000Z"),
    });
    await seedTask(project.id, {
      title: "Low todo",
      status: "to-do",
      priority: "low",
      dueDate: new Date("2026-08-10T00:00:00.000Z"),
    });
    await seedTask(project.id, {
      title: "Out of range",
      status: "in-progress",
      priority: "urgent",
      dueDate: new Date("2026-09-15T00:00:00.000Z"),
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await fetchWorkspaceTasks(app, member.workspace.id, {
      status: "in-progress",
      priority: "urgent",
      dueAfter: "2026-07-01T00:00:00.000Z",
      dueBefore: "2026-08-31T00:00:00.000Z",
      sortBy: "dueDate",
      sortOrder: "asc",
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as WorkspaceTasksResponse;
    expect(payload.data.map((row) => row.id)).toEqual([early.id, late.id]);
  });

  it("rejects malformed dueBefore/dueAfter values with 400", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    await createProjectFixture({ workspaceId: member.workspace.id });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const badBefore = await fetchWorkspaceTasks(app, member.workspace.id, {
      dueBefore: "garbage",
    });
    expect(badBefore.status).toBe(400);

    const badAfter = await fetchWorkspaceTasks(app, member.workspace.id, {
      dueAfter: "not-a-date",
    });
    expect(badAfter.status).toBe(400);
  });

  it("paginates with a correct total and page contents", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    for (let i = 0; i < 5; i++) {
      await seedTask(project.id, {
        title: `Task ${i}`,
        dueDate: new Date(Date.UTC(2026, 7, i + 1)),
      });
    }

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const firstPage = await fetchWorkspaceTasks(app, member.workspace.id, {
      page: "1",
      limit: "2",
      sortBy: "dueDate",
      sortOrder: "asc",
    });
    const firstPayload = (await firstPage.json()) as WorkspaceTasksResponse;
    expect(firstPayload.data.map((row) => row.title)).toEqual([
      "Task 0",
      "Task 1",
    ]);
    expect(firstPayload.pagination).toEqual({
      total: 5,
      page: 1,
      pageSize: 2,
      totalPages: 3,
    });

    const lastPage = await fetchWorkspaceTasks(app, member.workspace.id, {
      page: "3",
      limit: "2",
      sortBy: "dueDate",
      sortOrder: "asc",
    });
    const lastPayload = (await lastPage.json()) as WorkspaceTasksResponse;
    expect(lastPayload.data.map((row) => row.title)).toEqual(["Task 4"]);
  });

  it("rejects users outside the workspace with 403", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const [outsider] = await db
      .insert(schema.userTable)
      .values({
        id: `user-${randomUUID()}`,
        email: `outsider-${randomUUID()}@example.com`,
        emailVerified: true,
        name: "Outsider",
      })
      .returning();

    mockAuthenticatedSession(outsider);
    const { app } = createApp();

    const response = await fetchWorkspaceTasks(app, member.workspace.id);
    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe(
      "You don't have access to this workspace",
    );
  });

  it("carries project fields and label arrays on each row", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Labeled Project",
      icon: "Rocket",
      slug: "labeled-project",
    });
    const task = await seedTask(project.id, {
      title: "Labeled",
      userId: member.user.id,
    });
    await db.insert(schema.labelTable).values({
      name: "bug",
      color: "red",
      taskId: task.id,
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await fetchWorkspaceTasks(app, member.workspace.id);
    const payload = (await response.json()) as WorkspaceTasksResponse;
    const row = payload.data.find((candidate) => candidate.id === task.id);
    expect(row).toMatchObject({
      projectId: project.id,
      projectSlug: "labeled-project",
      projectName: "Labeled Project",
      projectIcon: "Rocket",
      userId: member.user.id,
      assigneeName: member.user.name,
    });
    expect(row?.labels).toEqual([
      expect.objectContaining({ name: "bug", color: "red" }),
    ]);
  });

  it("resolves GET /task/workspace-tasks to the list controller, not the get-by-id route", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    await seedTask(project.id, { title: "Shadow check" });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await fetchWorkspaceTasks(app, member.workspace.id);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as WorkspaceTasksResponse;
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.pagination).toMatchObject({ page: 1 });
  });

  it("omits archived tasks by default and returns only them for status=archived", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const active = await seedTask(project.id, { title: "Active" });
    const archived = await seedTask(project.id, {
      title: "Archived",
      status: "archived",
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const defaultResponse = await fetchWorkspaceTasks(app, member.workspace.id);
    const defaultPayload =
      (await defaultResponse.json()) as WorkspaceTasksResponse;
    expect(defaultPayload.data.map((row) => row.id)).toEqual([active.id]);

    const archivedResponse = await fetchWorkspaceTasks(
      app,
      member.workspace.id,
      { status: "archived" },
    );
    const archivedPayload =
      (await archivedResponse.json()) as WorkspaceTasksResponse;
    expect(archivedPayload.data.map((row) => row.id)).toEqual([archived.id]);
  });

  it("returns only tasks without a due date for noDueDate=true", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const undated = await seedTask(project.id, { title: "Undated" });
    await seedTask(project.id, {
      title: "Dated",
      dueDate: new Date("2026-08-05T00:00:00.000Z"),
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await fetchWorkspaceTasks(app, member.workspace.id, {
      noDueDate: "true",
    });
    const payload = (await response.json()) as WorkspaceTasksResponse;
    expect(payload.data.map((row) => row.id)).toEqual([undated.id]);
  });

  it("defaults sortBy=priority to urgent-first when no sortOrder is given", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    // Seed low-to-urgent so insertion order cannot fake urgent-first.
    await seedTask(project.id, { title: "None", priority: "no-priority" });
    await seedTask(project.id, { title: "Low", priority: "low" });
    await seedTask(project.id, { title: "Medium", priority: "medium" });
    await seedTask(project.id, { title: "High", priority: "high" });
    await seedTask(project.id, { title: "Urgent", priority: "urgent" });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await fetchWorkspaceTasks(app, member.workspace.id, {
      sortBy: "priority",
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as WorkspaceTasksResponse;
    expect(payload.data.map((row) => row.title)).toEqual([
      "Urgent",
      "High",
      "Medium",
      "Low",
      "None",
    ]);
  });

  it("still honors an explicit sortOrder=asc for sortBy=priority", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    await seedTask(project.id, { title: "Urgent", priority: "urgent" });
    await seedTask(project.id, { title: "Low", priority: "low" });
    await seedTask(project.id, { title: "High", priority: "high" });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await fetchWorkspaceTasks(app, member.workspace.id, {
      sortBy: "priority",
      sortOrder: "asc",
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as WorkspaceTasksResponse;
    expect(payload.data.map((row) => row.title)).toEqual([
      "Low",
      "High",
      "Urgent",
    ]);
  });

  it("orders rows project-first, then by the requested sort within each project", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project: alpha } = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Alpha",
    });
    const { project: zulu } = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Zulu",
    });
    // Seed Zulu rows first so insertion order cannot fake the expected order.
    await seedTask(zulu.id, { title: "Banana" });
    await seedTask(zulu.id, { title: "Apple" });
    await seedTask(alpha.id, { title: "Delta" });
    await seedTask(alpha.id, { title: "Charlie" });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await fetchWorkspaceTasks(app, member.workspace.id, {
      sortBy: "title",
      sortOrder: "asc",
    });
    const payload = (await response.json()) as WorkspaceTasksResponse;
    expect(
      payload.data.map((row) => `${row.projectName}:${row.title}`),
    ).toEqual(["Alpha:Charlie", "Alpha:Delta", "Zulu:Apple", "Zulu:Banana"]);
  });
});
