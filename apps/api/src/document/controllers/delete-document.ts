import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { documentTable } from "../../database/schema";
import { publishEvent } from "../../events";

async function deleteDocument(id: string, workspaceId: string, userId: string) {
  const [existing] = await db
    .select()
    .from(documentTable)
    .where(
      and(eq(documentTable.id, id), eq(documentTable.workspaceId, workspaceId)),
    );

  if (!existing) {
    throw new HTTPException(404, {
      message:
        "Document doesn't exist or doesn't belong to the specified workspace",
    });
  }

  if (!existing.archivedAt) {
    throw new HTTPException(400, {
      message: "Only archived documents can be deleted",
    });
  }

  // The self-referencing FK and the version FK both cascade, so deleting the
  // root removes the (fully archived) subtree and all version rows.
  const [deleted] = await db
    .delete(documentTable)
    .where(eq(documentTable.id, id))
    .returning();

  if (!deleted) {
    throw new HTTPException(500, {
      message: "Failed to delete document",
    });
  }

  await publishEvent("document.deleted", {
    documentId: existing.id,
    workspaceId: existing.workspaceId,
    title: existing.title,
    userId,
  });

  return existing;
}

export default deleteDocument;
