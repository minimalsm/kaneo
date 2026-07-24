import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { documentTable, documentVersionTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { MAX_CONTENT_BYTES, SNAPSHOT_INTERVAL_MS } from "../constants";
import { deriveContentText } from "../content-text";
import { insertVersionSnapshot } from "../snapshot";

async function updateDocument(
  id: string,
  workspaceId: string,
  userId: string,
  input: {
    title?: string;
    content?: unknown;
  },
) {
  const { title } = input;
  const hasContent = input.content !== undefined;

  if (title === undefined && !hasContent) {
    throw new HTTPException(400, {
      message: "Nothing to update",
    });
  }

  if (hasContent) {
    const serialized = JSON.stringify(input.content) ?? "";
    if (Buffer.byteLength(serialized, "utf8") > MAX_CONTENT_BYTES) {
      throw new HTTPException(413, {
        message: "Document content exceeds the maximum allowed size",
      });
    }
  }

  const updatedDocument = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(documentTable)
      .where(
        and(
          eq(documentTable.id, id),
          eq(documentTable.workspaceId, workspaceId),
        ),
      );

    if (!existing) {
      throw new HTTPException(404, {
        message:
          "Document doesn't exist or doesn't belong to the specified workspace",
      });
    }

    const changes: Partial<typeof documentTable.$inferInsert> = {};

    if (title !== undefined) {
      changes.title = title;
    }

    if (hasContent) {
      const content = input.content ?? null;
      changes.content = content;
      changes.contentText =
        content === null ? null : deriveContentText(content);

      if (existing.content !== null) {
        const [newestVersion] = await tx
          .select({ createdAt: documentVersionTable.createdAt })
          .from(documentVersionTable)
          .where(eq(documentVersionTable.documentId, id))
          .orderBy(desc(documentVersionTable.createdAt))
          .limit(1);

        const snapshotDue =
          !newestVersion ||
          newestVersion.createdAt.getTime() < Date.now() - SNAPSHOT_INTERVAL_MS;

        if (snapshotDue) {
          await insertVersionSnapshot(tx, id, existing.content, userId);
        }
      }
    }

    const [updated] = await tx
      .update(documentTable)
      .set(changes)
      .where(eq(documentTable.id, id))
      .returning();

    if (!updated) {
      throw new HTTPException(500, {
        message: "Failed to update document",
      });
    }

    return updated;
  });

  await publishEvent("document.updated", {
    documentId: updatedDocument.id,
    workspaceId: updatedDocument.workspaceId,
    title: updatedDocument.title,
    userId,
  });

  return updatedDocument;
}

export default updateDocument;
