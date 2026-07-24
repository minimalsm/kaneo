import { and, eq, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { documentTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { getDocumentOrThrow } from "../get-document-or-throw";
import { collectSubtreeIds } from "./archive-document";

async function deleteDocument(id: string, workspaceId: string, userId: string) {
  const existing = await db.transaction(async (tx) => {
    const document = await getDocumentOrThrow(tx, id, workspaceId);

    if (!document.archivedAt) {
      throw new HTTPException(400, {
        message: "Only archived documents can be deleted",
      });
    }

    // Descendants can be individually unarchived, so an archived root does not
    // guarantee an archived subtree. Refuse to cascade-delete live documents.
    const subtreeIds = await collectSubtreeIds(tx, id);
    const [liveDescendant] = await tx
      .select({ id: documentTable.id })
      .from(documentTable)
      .where(
        and(
          inArray(documentTable.id, subtreeIds),
          isNull(documentTable.archivedAt),
        ),
      )
      .limit(1);

    if (liveDescendant) {
      throw new HTTPException(400, {
        message: "Document subtree contains non-archived documents",
      });
    }

    // The self-referencing FK and the version FK both cascade, so deleting the
    // root removes the (fully archived) subtree and all version rows.
    const [deleted] = await tx
      .delete(documentTable)
      .where(eq(documentTable.id, id))
      .returning();

    if (!deleted) {
      throw new HTTPException(500, {
        message: "Failed to delete document",
      });
    }

    return document;
  });

  await publishEvent("document.deleted", {
    documentId: existing.id,
    workspaceId: existing.workspaceId,
    title: existing.title,
    userId,
  });

  return existing;
}

export default deleteDocument;
