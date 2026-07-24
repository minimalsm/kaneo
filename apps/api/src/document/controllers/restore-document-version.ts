import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { documentTable, documentVersionTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { deriveContentText } from "../content-text";
import { getDocumentOrThrow } from "../get-document-or-throw";
import { insertVersionSnapshot } from "../snapshot";

async function restoreDocumentVersion(
  id: string,
  versionId: string,
  workspaceId: string,
  userId: string,
) {
  const restoredDocument = await db.transaction(async (tx) => {
    const existing = await getDocumentOrThrow(tx, id, workspaceId);

    const [version] = await tx
      .select()
      .from(documentVersionTable)
      .where(
        and(
          eq(documentVersionTable.id, versionId),
          eq(documentVersionTable.documentId, id),
        ),
      );

    if (!version) {
      throw new HTTPException(404, {
        message: "Version doesn't exist or doesn't belong to this document",
      });
    }

    // Always snapshot the pre-restore state first so the restore itself is
    // recoverable.
    if (existing.content !== null) {
      await insertVersionSnapshot(tx, id, existing.content, userId);
    }

    const [updated] = await tx
      .update(documentTable)
      .set({
        content: version.content,
        contentText: deriveContentText(version.content),
      })
      .where(eq(documentTable.id, id))
      .returning();

    if (!updated) {
      throw new HTTPException(500, {
        message: "Failed to restore document version",
      });
    }

    return updated;
  });

  await publishEvent("document.restored", {
    documentId: restoredDocument.id,
    workspaceId: restoredDocument.workspaceId,
    versionId,
    userId,
  });

  return restoredDocument;
}

export default restoreDocumentVersion;
