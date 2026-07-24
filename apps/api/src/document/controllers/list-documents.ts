import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import db from "../../database";
import { documentTable } from "../../database/schema";

async function listDocuments(workspaceId: string, archived: boolean) {
  return db
    .select({
      id: documentTable.id,
      parentId: documentTable.parentId,
      projectId: documentTable.projectId,
      title: documentTable.title,
      icon: documentTable.icon,
      sortOrder: documentTable.sortOrder,
      archivedAt: documentTable.archivedAt,
      createdAt: documentTable.createdAt,
      updatedAt: documentTable.updatedAt,
      createdBy: documentTable.createdBy,
    })
    .from(documentTable)
    .where(
      and(
        eq(documentTable.workspaceId, workspaceId),
        archived
          ? isNotNull(documentTable.archivedAt)
          : isNull(documentTable.archivedAt),
      ),
    )
    .orderBy(asc(documentTable.sortOrder), asc(documentTable.createdAt));
}

export default listDocuments;
