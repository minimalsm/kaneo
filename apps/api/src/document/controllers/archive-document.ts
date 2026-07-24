import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { documentTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { MAX_TREE_DEPTH } from "../constants";
import type { DocumentTransaction } from "../snapshot";

// Collects the ids of a document and its entire descendant subtree with a
// bounded breadth-first walk.
export async function collectSubtreeIds(
  tx: DocumentTransaction,
  rootId: string,
): Promise<string[]> {
  const collected = [rootId];
  let frontier = [rootId];

  for (let depth = 0; depth < MAX_TREE_DEPTH && frontier.length > 0; depth++) {
    const children = await tx
      .select({ id: documentTable.id })
      .from(documentTable)
      .where(inArray(documentTable.parentId, frontier));

    frontier = children
      .map((child) => child.id)
      .filter((childId) => !collected.includes(childId));
    collected.push(...frontier);
  }

  return collected;
}

async function archiveDocument(
  id: string,
  workspaceId: string,
  userId: string,
  archived: boolean,
) {
  const archivedDocument = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: documentTable.id })
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

    const subtreeIds = await collectSubtreeIds(tx, id);

    await tx
      .update(documentTable)
      .set({ archivedAt: archived ? new Date() : null })
      .where(inArray(documentTable.id, subtreeIds));

    const [updated] = await tx
      .select()
      .from(documentTable)
      .where(eq(documentTable.id, id));

    if (!updated) {
      throw new HTTPException(500, {
        message: "Failed to archive document",
      });
    }

    return updated;
  });

  await publishEvent("document.archived", {
    documentId: archivedDocument.id,
    workspaceId: archivedDocument.workspaceId,
    archivedAt: archivedDocument.archivedAt,
    userId,
  });

  return archivedDocument;
}

export default archiveDocument;
