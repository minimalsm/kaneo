import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import {
  MAX_CONTENT_BYTES,
  MAX_VERSIONS,
  SNAPSHOT_INTERVAL_MS,
} from "../../apps/api/src/document/constants";
import { subscribeToEvent } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

type DocumentRow = typeof schema.documentTable.$inferSelect;

function docContent(text: string) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

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

async function seedVersion(
  documentId: string,
  createdBy: string,
  content: unknown,
  createdAt: Date,
) {
  const [version] = await db
    .insert(schema.documentVersionTable)
    .values({
      documentId,
      createdBy,
      content,
      createdAt,
    })
    .returning();
  return version;
}

async function listVersions(documentId: string) {
  return db.query.documentVersionTable.findMany({
    where: eq(schema.documentVersionTable.documentId, documentId),
    orderBy: [asc(schema.documentVersionTable.createdAt)],
  });
}

async function updateDocument(
  app: ReturnType<typeof createApp>["app"],
  id: string,
  body: Record<string, unknown>,
) {
  return app.request(`/api/document/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API integration: documents", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  describe("create", () => {
    it("creates an Untitled document scoped to the workspace for a member", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request("/api/document", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: member.workspace.id }),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as DocumentRow;
      expect(payload).toMatchObject({
        workspaceId: member.workspace.id,
        title: "Untitled",
        parentId: null,
        projectId: null,
        archivedAt: null,
        createdBy: member.user.id,
      });

      const persisted = await db.query.documentTable.findFirst({
        where: eq(schema.documentTable.id, payload.id),
      });
      expect(persisted?.workspaceId).toBe(member.workspace.id);
    });

    it("allows a workspace owner to create a document (static role path)", async () => {
      const owner = await createWorkspaceMember({ role: "owner" });
      mockAuthenticatedSession(owner.user);
      const { app } = createApp();

      const response = await app.request("/api/document", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: owner.workspace.id,
          title: "Owner Doc",
        }),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as DocumentRow;
      expect(payload.title).toBe("Owner Doc");
    });

    it("appends new documents after existing siblings via sortOrder", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      await seedDocument(member.workspace.id, member.user.id, { sortOrder: 4 });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request("/api/document", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: member.workspace.id }),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as DocumentRow;
      expect(payload.sortOrder).toBe(5);
    });

    it("rejects creation with a parent from another workspace", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const other = await createWorkspaceMember({ role: "member" });
      const foreignParent = await seedDocument(
        other.workspace.id,
        other.user.id,
      );

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request("/api/document", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: member.workspace.id,
          parentId: foreignParent.id,
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects creation under an archived parent", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const archivedParent = await seedDocument(
        member.workspace.id,
        member.user.id,
        { archivedAt: new Date() },
      );

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request("/api/document", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: member.workspace.id,
          parentId: archivedParent.id,
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects creation for users outside the workspace", async () => {
      const member = await createWorkspaceMember();
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

      const response = await app.request("/api/document", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: member.workspace.id }),
      });

      expect(response.status).toBe(403);
      await expect(response.text()).resolves.toBe(
        "You don't have access to this workspace",
      );
    });

    it("blocks a viewer from creating a document (viewer lacks document:create)", async () => {
      const viewer = await createWorkspaceMember({ role: "viewer" });
      mockAuthenticatedSession(viewer.user);
      const { app } = createApp();

      const response = await app.request("/api/document", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: viewer.workspace.id }),
      });

      expect(response.status).toBe(403);
      await expect(response.text()).resolves.toBe("Insufficient permissions");
    });
  });

  describe("update", () => {
    it("persists ProseMirror JSON, derives contentText, and bumps updatedAt", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const staleDate = new Date(Date.now() - 60_000);
      const doc = await seedDocument(member.workspace.id, member.user.id, {
        updatedAt: staleDate,
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await updateDocument(app, doc.id, {
        content: docContent("Hello visible world"),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as DocumentRow;
      expect(payload.contentText).toContain("Hello visible world");
      expect(payload.content).toEqual(docContent("Hello visible world"));
      expect(new Date(payload.updatedAt).getTime()).toBeGreaterThan(
        staleDate.getTime(),
      );
    });

    it("does not snapshot when the stored content is null (first content write)", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const doc = await seedDocument(member.workspace.id, member.user.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await updateDocument(app, doc.id, {
        content: docContent("first"),
      });
      expect(response.status).toBe(200);

      await expect(listVersions(doc.id)).resolves.toHaveLength(0);
    });

    it("snapshots the pre-update stored content when no version exists yet", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const doc = await seedDocument(member.workspace.id, member.user.id, {
        content: docContent("original"),
        contentText: "original",
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await updateDocument(app, doc.id, {
        content: docContent("replacement"),
      });
      expect(response.status).toBe(200);

      const versions = await listVersions(doc.id);
      expect(versions).toHaveLength(1);
      expect(versions[0].content).toEqual(docContent("original"));
    });

    it("does not snapshot again within the snapshot interval", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const doc = await seedDocument(member.workspace.id, member.user.id, {
        content: docContent("v1"),
        contentText: "v1",
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      await updateDocument(app, doc.id, { content: docContent("v2") });
      const second = await updateDocument(app, doc.id, {
        content: docContent("v3"),
      });
      expect(second.status).toBe(200);

      const versions = await listVersions(doc.id);
      expect(versions).toHaveLength(1);
      expect(versions[0].content).toEqual(docContent("v1"));
    });

    it("snapshots again once the newest version is older than the interval", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const doc = await seedDocument(member.workspace.id, member.user.id, {
        content: docContent("current"),
        contentText: "current",
      });
      await seedVersion(
        doc.id,
        member.user.id,
        docContent("old snapshot"),
        new Date(Date.now() - SNAPSHOT_INTERVAL_MS - 1000),
      );

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await updateDocument(app, doc.id, {
        content: docContent("next"),
      });
      expect(response.status).toBe(200);

      const versions = await listVersions(doc.id);
      expect(versions).toHaveLength(2);
      expect(versions[1].content).toEqual(docContent("current"));
    });

    it("never snapshots on a title-only update", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const doc = await seedDocument(member.workspace.id, member.user.id, {
        content: docContent("body"),
        contentText: "body",
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await updateDocument(app, doc.id, {
        title: "Renamed",
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as DocumentRow;
      expect(payload.title).toBe("Renamed");

      await expect(listVersions(doc.id)).resolves.toHaveLength(0);
    });

    it("rejects oversized content with 413", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const doc = await seedDocument(member.workspace.id, member.user.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await updateDocument(app, doc.id, {
        content: docContent("x".repeat(MAX_CONTENT_BYTES + 1)),
      });
      expect(response.status).toBe(413);

      const persisted = await db.query.documentTable.findFirst({
        where: eq(schema.documentTable.id, doc.id),
      });
      expect(persisted?.content).toBeNull();
    });

    it("survives a deeply nested content payload without crashing derivation", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const doc = await seedDocument(member.workspace.id, member.user.id);

      let nested: Record<string, unknown> = {
        type: "text",
        text: "deep leaf",
      };
      for (let i = 0; i < 500; i++) {
        nested = { type: "blockquote", content: [nested] };
      }
      const content = { type: "doc", content: [nested] };

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await updateDocument(app, doc.id, { content });
      expect(response.status).toBe(200);
    });

    it("prunes the oldest version beyond the version cap", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const doc = await seedDocument(member.workspace.id, member.user.id, {
        content: docContent("current"),
        contentText: "current",
      });

      const base = Date.now() - SNAPSHOT_INTERVAL_MS - MAX_VERSIONS * 2000;
      const seeded = [];
      for (let i = 0; i < MAX_VERSIONS; i++) {
        seeded.push(
          await seedVersion(
            doc.id,
            member.user.id,
            docContent(`v${i}`),
            new Date(base + i * 1000),
          ),
        );
      }

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await updateDocument(app, doc.id, {
        content: docContent("newest"),
      });
      expect(response.status).toBe(200);

      const versions = await listVersions(doc.id);
      expect(versions).toHaveLength(MAX_VERSIONS);
      expect(
        versions.find((version) => version.id === seeded[0].id),
      ).toBeUndefined();
      expect(versions[versions.length - 1].content).toEqual(
        docContent("current"),
      );
    });
  });

  describe("versions", () => {
    it("lists versions newest-first without content", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const doc = await seedDocument(member.workspace.id, member.user.id);
      const older = await seedVersion(
        doc.id,
        member.user.id,
        docContent("older"),
        new Date(Date.now() - 60_000),
      );
      const newer = await seedVersion(
        doc.id,
        member.user.id,
        docContent("newer"),
        new Date(Date.now() - 30_000),
      );

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/document/${doc.id}/versions`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Array<Record<string, unknown>>;
      expect(payload.map((version) => version.id)).toEqual([
        newer.id,
        older.id,
      ]);
      expect(payload[0]).not.toHaveProperty("content");
    });

    it("restores a version and snapshots the pre-restore state first", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const doc = await seedDocument(member.workspace.id, member.user.id, {
        content: docContent("current state"),
        contentText: "current state",
      });
      const version = await seedVersion(
        doc.id,
        member.user.id,
        docContent("restored state"),
        new Date(Date.now() - 60_000),
      );

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(
        `/api/document/${doc.id}/versions/${version.id}/restore`,
        { method: "PUT" },
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as DocumentRow;
      expect(payload.content).toEqual(docContent("restored state"));
      expect(payload.contentText).toContain("restored state");

      const versions = await listVersions(doc.id);
      expect(versions).toHaveLength(2);
      expect(versions[1].content).toEqual(docContent("current state"));
    });

    it("404s when restoring a version belonging to another document", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const doc = await seedDocument(member.workspace.id, member.user.id);
      const otherDoc = await seedDocument(member.workspace.id, member.user.id);
      const foreignVersion = await seedVersion(
        otherDoc.id,
        member.user.id,
        docContent("foreign"),
        new Date(),
      );

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(
        `/api/document/${doc.id}/versions/${foreignVersion.id}/restore`,
        { method: "PUT" },
      );
      expect(response.status).toBe(404);
    });
  });

  describe("move", () => {
    it("re-parents a document", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const parent = await seedDocument(member.workspace.id, member.user.id);
      const doc = await seedDocument(member.workspace.id, member.user.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/document/${doc.id}/move`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: parent.id }),
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as DocumentRow;
      expect(payload.parentId).toBe(parent.id);
    });

    it("rejects moving a document under its own descendant", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const root = await seedDocument(member.workspace.id, member.user.id);
      const child = await seedDocument(member.workspace.id, member.user.id, {
        parentId: root.id,
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/document/${root.id}/move`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: child.id }),
      });
      expect(response.status).toBe(400);
    });

    it("rejects moving under an archived parent", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const doc = await seedDocument(member.workspace.id, member.user.id);
      const archivedParent = await seedDocument(
        member.workspace.id,
        member.user.id,
        { archivedAt: new Date() },
      );

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/document/${doc.id}/move`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: archivedParent.id }),
      });
      expect(response.status).toBe(400);
    });

    it("rejects moving under a parent from another workspace", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const other = await createWorkspaceMember({ role: "member" });
      const doc = await seedDocument(member.workspace.id, member.user.id);
      const foreignParent = await seedDocument(
        other.workspace.id,
        other.user.id,
      );

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/document/${doc.id}/move`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: foreignParent.id }),
      });
      expect(response.status).toBe(400);
    });
  });

  describe("archive, list, and delete", () => {
    it("archives the subtree, hides it from the default list, and unarchives it back", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const parent = await seedDocument(member.workspace.id, member.user.id);
      const child = await seedDocument(member.workspace.id, member.user.id, {
        parentId: parent.id,
      });
      const untouched = await seedDocument(member.workspace.id, member.user.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const archiveResponse = await app.request(
        `/api/document/${parent.id}/archive`,
        { method: "PUT" },
      );
      expect(archiveResponse.status).toBe(200);

      const defaultList = await app.request(
        `/api/document?workspaceId=${member.workspace.id}`,
      );
      const defaultDocs = (await defaultList.json()) as Array<{ id: string }>;
      expect(defaultDocs.map((docRow) => docRow.id)).toEqual([untouched.id]);

      const archivedList = await app.request(
        `/api/document?workspaceId=${member.workspace.id}&archived=true`,
      );
      const archivedDocs = (await archivedList.json()) as Array<{
        id: string;
      }>;
      expect(archivedDocs.map((docRow) => docRow.id).sort()).toEqual(
        [parent.id, child.id].sort(),
      );

      const unarchiveResponse = await app.request(
        `/api/document/${parent.id}/unarchive`,
        { method: "PUT" },
      );
      expect(unarchiveResponse.status).toBe(200);

      const restoredList = await app.request(
        `/api/document?workspaceId=${member.workspace.id}`,
      );
      const restoredDocs = (await restoredList.json()) as Array<{
        id: string;
      }>;
      expect(restoredDocs.map((docRow) => docRow.id).sort()).toEqual(
        [parent.id, child.id, untouched.id].sort(),
      );
    });

    it("omits content payloads from the list response", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      await seedDocument(member.workspace.id, member.user.id, {
        content: docContent("hidden body"),
        contentText: "hidden body",
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(
        `/api/document?workspaceId=${member.workspace.id}`,
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as Array<Record<string, unknown>>;
      expect(payload).toHaveLength(1);
      expect(payload[0]).not.toHaveProperty("content");
      expect(payload[0]).not.toHaveProperty("contentText");
    });

    it("rejects deleting a non-archived document", async () => {
      const member = await createWorkspaceMember({ role: "admin" });
      const doc = await seedDocument(member.workspace.id, member.user.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/document/${doc.id}`, {
        method: "DELETE",
      });
      expect(response.status).toBe(400);

      const persisted = await db.query.documentTable.findFirst({
        where: eq(schema.documentTable.id, doc.id),
      });
      expect(persisted).toBeDefined();
    });

    it("hard-deletes an archived document along with its versions", async () => {
      const member = await createWorkspaceMember({ role: "admin" });
      const doc = await seedDocument(member.workspace.id, member.user.id, {
        archivedAt: new Date(),
      });
      await seedVersion(
        doc.id,
        member.user.id,
        docContent("history"),
        new Date(),
      );

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/document/${doc.id}`, {
        method: "DELETE",
      });
      expect(response.status).toBe(200);

      const persisted = await db.query.documentTable.findFirst({
        where: eq(schema.documentTable.id, doc.id),
      });
      expect(persisted).toBeUndefined();
      await expect(listVersions(doc.id)).resolves.toHaveLength(0);
    });

    it("deleting an archived parent removes its subtree", async () => {
      const member = await createWorkspaceMember({ role: "admin" });
      const archivedAt = new Date();
      const parent = await seedDocument(member.workspace.id, member.user.id, {
        archivedAt,
      });
      const child = await seedDocument(member.workspace.id, member.user.id, {
        parentId: parent.id,
        archivedAt,
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/document/${parent.id}`, {
        method: "DELETE",
      });
      expect(response.status).toBe(200);

      const remaining = await db.query.documentTable.findMany({
        where: eq(schema.documentTable.workspaceId, member.workspace.id),
      });
      expect(
        remaining.find((docRow) => docRow.id === child.id),
      ).toBeUndefined();
    });

    it("rejects deleting an archived parent whose subtree contains a live document, then succeeds once the child is archived too", async () => {
      const member = await createWorkspaceMember({ role: "admin" });
      const parent = await seedDocument(member.workspace.id, member.user.id, {
        archivedAt: new Date(),
      });
      // A child unarchived on its own after the parent was archived.
      const child = await seedDocument(member.workspace.id, member.user.id, {
        parentId: parent.id,
        archivedAt: null,
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const rejected = await app.request(`/api/document/${parent.id}`, {
        method: "DELETE",
      });
      expect(rejected.status).toBe(400);
      await expect(rejected.text()).resolves.toContain(
        "Document subtree contains non-archived documents",
      );

      const survivors = await db.query.documentTable.findMany({
        where: eq(schema.documentTable.workspaceId, member.workspace.id),
      });
      expect(survivors.map((docRow) => docRow.id).sort()).toEqual(
        [parent.id, child.id].sort(),
      );

      const archiveChild = await app.request(
        `/api/document/${child.id}/archive`,
        { method: "PUT" },
      );
      expect(archiveChild.status).toBe(200);

      const deleted = await app.request(`/api/document/${parent.id}`, {
        method: "DELETE",
      });
      expect(deleted.status).toBe(200);

      const remaining = await db.query.documentTable.findMany({
        where: eq(schema.documentTable.workspaceId, member.workspace.id),
      });
      expect(remaining).toHaveLength(0);
    });
  });

  describe("events", () => {
    it("publishes document.created and document.updated events", async () => {
      const createdEvents: Array<Record<string, unknown>> = [];
      const updatedEvents: Array<Record<string, unknown>> = [];
      await subscribeToEvent<Record<string, unknown>>(
        "document.created",
        async (data) => {
          createdEvents.push(data);
        },
      );
      await subscribeToEvent<Record<string, unknown>>(
        "document.updated",
        async (data) => {
          updatedEvents.push(data);
        },
      );

      const member = await createWorkspaceMember({ role: "member" });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const createResponse = await app.request("/api/document", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: member.workspace.id }),
      });
      expect(createResponse.status).toBe(200);
      const created = (await createResponse.json()) as DocumentRow;

      const updateResponse = await updateDocument(app, created.id, {
        title: "Eventful",
      });
      expect(updateResponse.status).toBe(200);

      expect(
        createdEvents.find((event) => event.documentId === created.id),
      ).toMatchObject({
        documentId: created.id,
        workspaceId: member.workspace.id,
        userId: member.user.id,
      });
      expect(
        updatedEvents.find((event) => event.documentId === created.id),
      ).toMatchObject({
        documentId: created.id,
        workspaceId: member.workspace.id,
        userId: member.user.id,
      });
    });
  });
});
