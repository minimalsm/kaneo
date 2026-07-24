import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { documentTable } from "../../database/schema";

async function getDocument(id: string, workspaceId: string) {
  const [document] = await db
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

export default getDocument;
