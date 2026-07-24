import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { documentTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { MAX_TREE_DEPTH } from "../constants";

async function moveDocument(
  id: string,
  workspaceId: string,
  userId: string,
  input: {
    parentId: string | null;
    position?: number;
  },
) {
  const { parentId, position } = input;

  const movedDocument = await db.transaction(async (tx) => {
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

    if (parentId !== null) {
      if (parentId === id) {
        throw new HTTPException(400, {
          message: "A document cannot be its own parent",
        });
      }

      const [parent] = await tx
        .select({
          id: documentTable.id,
          workspaceId: documentTable.workspaceId,
          parentId: documentTable.parentId,
        })
        .from(documentTable)
        .where(eq(documentTable.id, parentId))
        .limit(1);

      if (!parent || parent.workspaceId !== workspaceId) {
        throw new HTTPException(400, {
          message: "Parent document doesn't belong to the specified workspace",
        });
      }

      // Walk the ancestor chain of the new parent; if the moved document
      // appears, the target is inside its own subtree. The walk is bounded so
      // pathological chains are rejected instead of looping.
      let ancestorId = parent.parentId;
      let depth = 0;
      while (ancestorId !== null) {
        if (ancestorId === id) {
          throw new HTTPException(400, {
            message: "A document cannot be moved under its own descendant",
          });
        }
        depth += 1;
        if (depth > MAX_TREE_DEPTH) {
          throw new HTTPException(400, {
            message: "Document tree is too deep to validate this move",
          });
        }
        const [ancestor] = await tx
          .select({ parentId: documentTable.parentId })
          .from(documentTable)
          .where(eq(documentTable.id, ancestorId))
          .limit(1);
        ancestorId = ancestor?.parentId ?? null;
      }
    }

    const siblings = await tx
      .select({ id: documentTable.id })
      .from(documentTable)
      .where(
        and(
          eq(documentTable.workspaceId, workspaceId),
          parentId === null
            ? isNull(documentTable.parentId)
            : eq(documentTable.parentId, parentId),
          ne(documentTable.id, id),
        ),
      )
      .orderBy(asc(documentTable.sortOrder), asc(documentTable.createdAt));

    const targetPosition = Math.max(
      0,
      Math.min(position ?? siblings.length, siblings.length),
    );

    const orderedIds = siblings.map((sibling) => sibling.id);
    orderedIds.splice(targetPosition, 0, id);

    for (const [index, documentId] of orderedIds.entries()) {
      await tx
        .update(documentTable)
        .set(
          documentId === id
            ? { parentId, sortOrder: index }
            : { sortOrder: index },
        )
        .where(eq(documentTable.id, documentId));
    }

    const [moved] = await tx
      .select()
      .from(documentTable)
      .where(eq(documentTable.id, id));

    if (!moved) {
      throw new HTTPException(500, {
        message: "Failed to move document",
      });
    }

    return moved;
  });

  await publishEvent("document.moved", {
    documentId: movedDocument.id,
    workspaceId: movedDocument.workspaceId,
    parentId: movedDocument.parentId,
    sortOrder: movedDocument.sortOrder,
    userId,
  });

  return movedDocument;
}

export default moveDocument;
