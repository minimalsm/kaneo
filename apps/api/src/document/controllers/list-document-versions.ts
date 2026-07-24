import { desc, eq } from "drizzle-orm";
import db from "../../database";
import { documentVersionTable } from "../../database/schema";
import { getDocumentOrThrow } from "../get-document-or-throw";

async function listDocumentVersions(id: string, workspaceId: string) {
  await getDocumentOrThrow(db, id, workspaceId);

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
