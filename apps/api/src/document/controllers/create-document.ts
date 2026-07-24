import { and, eq, isNull, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { documentTable, projectTable } from "../../database/schema";
import { publishEvent } from "../../events";

async function createDocument(
  workspaceId: string,
  userId: string,
  input: {
    title?: string;
    parentId?: string;
    projectId?: string;
  },
) {
  const { title, parentId, projectId } = input;

  if (parentId) {
    const [parent] = await db
      .select({ workspaceId: documentTable.workspaceId })
      .from(documentTable)
      .where(eq(documentTable.id, parentId))
      .limit(1);

    if (!parent || parent.workspaceId !== workspaceId) {
      throw new HTTPException(400, {
        message: "Parent document doesn't belong to the specified workspace",
      });
    }
  }

  if (projectId) {
    const [project] = await db
      .select({ workspaceId: projectTable.workspaceId })
      .from(projectTable)
      .where(eq(projectTable.id, projectId))
      .limit(1);

    if (!project || project.workspaceId !== workspaceId) {
      throw new HTTPException(400, {
        message: "Project doesn't belong to the specified workspace",
      });
    }
  }

  const [maxSortOrderRow] = await db
    .select({ maxSortOrder: max(documentTable.sortOrder) })
    .from(documentTable)
    .where(
      and(
        eq(documentTable.workspaceId, workspaceId),
        parentId
          ? eq(documentTable.parentId, parentId)
          : isNull(documentTable.parentId),
      ),
    );

  const [createdDocument] = await db
    .insert(documentTable)
    .values({
      workspaceId,
      title: title || "Untitled",
      parentId: parentId || null,
      projectId: projectId || null,
      sortOrder: (maxSortOrderRow?.maxSortOrder ?? -1) + 1,
      createdBy: userId,
    })
    .returning();

  if (!createdDocument) {
    throw new HTTPException(500, {
      message: "Failed to create document",
    });
  }

  await publishEvent("document.created", {
    ...createdDocument,
    documentId: createdDocument.id,
    userId,
  });

  return createdDocument;
}

export default createDocument;
