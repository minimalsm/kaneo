import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../database";
import { documentTable } from "../database/schema";
import type { DocumentTransaction } from "./snapshot";

// Fetches a document scoped to a workspace, throwing a 404 when it's missing
// or belongs to a different workspace.
export async function getDocumentOrThrow(
  executor: typeof db | DocumentTransaction,
  id: string,
  workspaceId: string,
) {
  const [document] = await executor
    .select()
    .from(documentTable)
    .where(
      and(eq(documentTable.id, id), eq(documentTable.workspaceId, workspaceId)),
    );

  if (!document) {
    throw new HTTPException(404, {
      message:
        "Document doesn't exist or doesn't belong to the specified workspace",
    });
  }

  return document;
}
