import { desc, eq, inArray } from "drizzle-orm";
import type db from "../database";
import { documentVersionTable } from "../database/schema";
import { MAX_VERSIONS } from "./constants";

export type DocumentTransaction = Parameters<
  Parameters<(typeof db)["transaction"]>[0]
>[0];

// Inserts a version snapshot and prunes the oldest versions beyond the cap,
// inside the caller's transaction.
export async function insertVersionSnapshot(
  tx: DocumentTransaction,
  documentId: string,
  content: unknown,
  createdBy: string,
) {
  await tx.insert(documentVersionTable).values({
    documentId,
    content,
    createdBy,
  });

  const excess = await tx
    .select({ id: documentVersionTable.id })
    .from(documentVersionTable)
    .where(eq(documentVersionTable.documentId, documentId))
    .orderBy(desc(documentVersionTable.createdAt))
    .offset(MAX_VERSIONS);

  if (excess.length > 0) {
    await tx.delete(documentVersionTable).where(
      inArray(
        documentVersionTable.id,
        excess.map((version) => version.id),
      ),
    );
  }
}
