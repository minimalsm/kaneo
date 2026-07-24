import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { documentTable, documentVersionTable } from "../../database/schema";

async function listDocumentVersions(id: string, workspaceId: string) {
  const [existing] = await db
    .select({ id: documentTable.id })
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

  return db
    .select({
      id: documentVersionTable.id,
      documentId: documentVersionTable.documentId,
      createdBy: documentVersionTable.createdBy,
      createdAt: documentVersionTable.createdAt,
    })
    .from(documentVersionTable)
    .where(eq(documentVersionTable.documentId, id))
    .orderBy(desc(documentVersionTable.createdAt));
}

export default listDocumentVersions;
