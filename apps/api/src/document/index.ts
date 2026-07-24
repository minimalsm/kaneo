import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import {
  documentListItemSchema,
  documentSchema,
  documentVersionSchema,
} from "../schemas";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import archiveDocumentCtrl from "./controllers/archive-document";
import createDocumentCtrl from "./controllers/create-document";
import deleteDocumentCtrl from "./controllers/delete-document";
import getDocumentCtrl from "./controllers/get-document";
import listDocumentVersionsCtrl from "./controllers/list-document-versions";
import listDocumentsCtrl from "./controllers/list-documents";
import moveDocumentCtrl from "./controllers/move-document";
import restoreDocumentVersionCtrl from "./controllers/restore-document-version";
import updateDocumentCtrl from "./controllers/update-document";

const document = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listDocuments",
      tags: ["Documents"],
      description:
        "Get all non-archived documents in a workspace as a flat list (pass archived=true for archived documents)",
      responses: {
        200: {
          description: "Flat list of documents without content payloads",
          content: {
            "application/json": {
              schema: resolver(v.array(documentListItemSchema)),
            },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.string(),
        archived: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromQuery(),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const { archived } = c.req.valid("query");
      const documents = await listDocumentsCtrl(
        workspaceId,
        archived === "true",
      );
      return c.json(documents);
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createDocument",
      tags: ["Documents"],
      description: "Create a new document in a workspace",
      responses: {
        200: {
          description: "Document created successfully",
          content: {
            "application/json": { schema: resolver(documentSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        title: v.optional(v.string()),
        parentId: v.optional(v.string()),
        projectId: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ document: ["create"] }),
    async (c) => {
      const { title, parentId, projectId } = c.req.valid("json");
      const workspaceId = c.get("workspaceId");
      const userId = c.get("userId");
      const newDocument = await createDocumentCtrl(workspaceId, userId, {
        title,
        parentId,
        projectId,
      });
      return c.json(newDocument);
    },
  )
  .get(
    "/:id",
    describeRoute({
      operationId: "getDocument",
      tags: ["Documents"],
      description: "Get a specific document by ID, including its content",
      responses: {
        200: {
          description: "Document details",
          content: {
            "application/json": { schema: resolver(documentSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromDocument(),
    async (c) => {
      const { id } = c.req.valid("param");
      const workspaceId = c.get("workspaceId");
      const documentData = await getDocumentCtrl(id, workspaceId);
      return c.json(documentData);
    },
  )
  .put(
    "/:id",
    describeRoute({
      operationId: "updateDocument",
      tags: ["Documents"],
      description:
        "Update a document's title and/or ProseMirror JSON content; content updates derive contentText and may capture a version snapshot",
      responses: {
        200: {
          description: "Document updated successfully",
          content: {
            "application/json": { schema: resolver(documentSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        title: v.optional(v.string()),
        content: v.optional(v.unknown()),
      }),
    ),
    workspaceAccess.fromDocument(),
    requireWorkspacePermission({ document: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { title, content } = c.req.valid("json");
      const workspaceId = c.get("workspaceId");
      const userId = c.get("userId");
      const updatedDocument = await updateDocumentCtrl(
        id,
        workspaceId,
        userId,
        {
          title,
          content,
        },
      );
      return c.json(updatedDocument);
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteDocument",
      tags: ["Documents"],
      description:
        "Permanently delete an archived document and its subtree and versions",
      responses: {
        200: {
          description: "Document deleted successfully",
          content: {
            "application/json": { schema: resolver(documentSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromDocument(),
    requireWorkspacePermission({ document: ["delete"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const workspaceId = c.get("workspaceId");
      const userId = c.get("userId");
      const deletedDocument = await deleteDocumentCtrl(id, workspaceId, userId);
      return c.json(deletedDocument);
    },
  )
  .put(
    "/:id/move",
    describeRoute({
      operationId: "moveDocument",
      tags: ["Documents"],
      description:
        "Move a document to a new parent (null for root) and optional position among siblings",
      responses: {
        200: {
          description: "Document moved successfully",
          content: {
            "application/json": { schema: resolver(documentSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        parentId: v.nullable(v.string()),
        position: v.optional(v.number()),
      }),
    ),
    workspaceAccess.fromDocument(),
    requireWorkspacePermission({ document: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { parentId, position } = c.req.valid("json");
      const workspaceId = c.get("workspaceId");
      const userId = c.get("userId");
      const movedDocument = await moveDocumentCtrl(id, workspaceId, userId, {
        parentId,
        position,
      });
      return c.json(movedDocument);
    },
  )
  .put(
    "/:id/archive",
    describeRoute({
      operationId: "archiveDocument",
      tags: ["Documents"],
      description: "Archive a document and its entire descendant subtree",
      responses: {
        200: {
          description: "Document archived successfully",
          content: {
            "application/json": { schema: resolver(documentSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromDocument(),
    requireWorkspacePermission({ document: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const workspaceId = c.get("workspaceId");
      const userId = c.get("userId");
      const archivedDocument = await archiveDocumentCtrl(
        id,
        workspaceId,
        userId,
        true,
      );
      return c.json(archivedDocument);
    },
  )
  .put(
    "/:id/unarchive",
    describeRoute({
      operationId: "unarchiveDocument",
      tags: ["Documents"],
      description: "Unarchive a document and its entire descendant subtree",
      responses: {
        200: {
          description: "Document unarchived successfully",
          content: {
            "application/json": { schema: resolver(documentSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromDocument(),
    requireWorkspacePermission({ document: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const workspaceId = c.get("workspaceId");
      const userId = c.get("userId");
      const unarchivedDocument = await archiveDocumentCtrl(
        id,
        workspaceId,
        userId,
        false,
      );
      return c.json(unarchivedDocument);
    },
  )
  .get(
    "/:id/versions",
    describeRoute({
      operationId: "listDocumentVersions",
      tags: ["Documents"],
      description:
        "List a document's version snapshots newest-first (metadata only, no content)",
      responses: {
        200: {
          description: "List of document versions",
          content: {
            "application/json": {
              schema: resolver(v.array(documentVersionSchema)),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromDocument(),
    async (c) => {
      const { id } = c.req.valid("param");
      const workspaceId = c.get("workspaceId");
      const versions = await listDocumentVersionsCtrl(id, workspaceId);
      return c.json(versions);
    },
  )
  .put(
    "/:id/versions/:versionId/restore",
    describeRoute({
      operationId: "restoreDocumentVersion",
      tags: ["Documents"],
      description:
        "Restore a document to a version snapshot, snapshotting the pre-restore state first",
      responses: {
        200: {
          description: "Document version restored successfully",
          content: {
            "application/json": { schema: resolver(documentSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string(), versionId: v.string() })),
    workspaceAccess.fromDocument(),
    requireWorkspacePermission({ document: ["update"] }),
    async (c) => {
      const { id, versionId } = c.req.valid("param");
      const workspaceId = c.get("workspaceId");
      const userId = c.get("userId");
      const restoredDocument = await restoreDocumentVersionCtrl(
        id,
        versionId,
        workspaceId,
        userId,
      );
      return c.json(restoredDocument);
    },
  );

export default document;
