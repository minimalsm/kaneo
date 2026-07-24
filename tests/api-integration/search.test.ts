import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type SearchResponse = {
  results: Array<{
    id: string;
    type: string;
    title: string;
    workspaceId?: string;
  }>;
  totalCount: number;
  searchQuery: string;
};

async function seedDocument(
  workspaceId: string,
  createdBy: string,
  overrides: Partial<typeof schema.documentTable.$inferInsert> = {},
) {
  const [doc] = await db
    .insert(schema.documentTable)
    .values({
      workspaceId,
      createdBy,
      title: "Seeded Document",
      ...overrides,
    })
    .returning();
  return doc;
}

async function searchRequest(
  app: ReturnType<typeof createApp>["app"],
  query: Record<string, string>,
) {
  const params = new URLSearchParams(query);
  return app.request(`/api/search?${params.toString()}`);
}

describe("API integration: global search", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  describe("documents", () => {
    it("returns a document whose title matches the query", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const doc = await seedDocument(member.workspace.id, member.user.id, {
        title: "Quarterly Roadmap",
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await searchRequest(app, { q: "Roadmap" });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as SearchResponse;

      const match = payload.results.find((result) => result.id === doc.id);
      expect(match).toMatchObject({
        id: doc.id,
        type: "document",
        title: "Quarterly Roadmap",
        workspaceId: member.workspace.id,
      });
    });

    it("returns a document whose body text (contentText) matches the query", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const doc = await seedDocument(member.workspace.id, member.user.id, {
        title: "Untitled",
        contentText: "the launch checklist lives here",
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await searchRequest(app, { q: "launch checklist" });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as SearchResponse;

      const match = payload.results.find((result) => result.id === doc.id);
      expect(match).toBeDefined();
      expect(match?.type).toBe("document");
    });

    it("never returns documents from workspaces the user is not a member of", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const outsider = await createWorkspaceMember({ role: "member" });
      const foreignDoc = await seedDocument(
        outsider.workspace.id,
        outsider.user.id,
        { title: "Confidential Findings" },
      );

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await searchRequest(app, { q: "Confidential" });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as SearchResponse;

      expect(
        payload.results.find((result) => result.id === foreignDoc.id),
      ).toBeUndefined();
    });

    it("excludes archived documents", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const archived = await seedDocument(member.workspace.id, member.user.id, {
        title: "Archived Meeting Notes",
        archivedAt: new Date(),
      });
      const active = await seedDocument(member.workspace.id, member.user.id, {
        title: "Active Meeting Notes",
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await searchRequest(app, { q: "Meeting Notes" });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as SearchResponse;

      expect(
        payload.results.find((result) => result.id === archived.id),
      ).toBeUndefined();
      expect(
        payload.results.find((result) => result.id === active.id),
      ).toBeDefined();
    });

    it("filters to documents only when type=documents", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      await createProjectFixture({
        workspaceId: member.workspace.id,
        name: "Apollo Project",
      });
      const doc = await seedDocument(member.workspace.id, member.user.id, {
        title: "Apollo Notes",
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await searchRequest(app, {
        q: "Apollo",
        type: "documents",
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as SearchResponse;

      expect(payload.results.length).toBeGreaterThan(0);
      expect(
        payload.results.every((result) => result.type === "document"),
      ).toBe(true);
      expect(
        payload.results.find((result) => result.id === doc.id),
      ).toBeDefined();
    });

    it("scopes document results to the requested workspaceId", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const secondWorkspace = await createWorkspaceMember({ role: "member" });
      // Make the user a member of the second workspace too
      await db.insert(schema.workspaceUserTable).values({
        workspaceId: secondWorkspace.workspace.id,
        userId: member.user.id,
        role: "member",
        joinedAt: new Date(),
      });

      const inScope = await seedDocument(member.workspace.id, member.user.id, {
        title: "Shared Handbook",
      });
      const outOfScope = await seedDocument(
        secondWorkspace.workspace.id,
        secondWorkspace.user.id,
        { title: "Shared Handbook Two" },
      );

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await searchRequest(app, {
        q: "Handbook",
        workspaceId: member.workspace.id,
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as SearchResponse;

      expect(
        payload.results.find((result) => result.id === inScope.id),
      ).toBeDefined();
      expect(
        payload.results.find((result) => result.id === outOfScope.id),
      ).toBeUndefined();
    });
  });
});
