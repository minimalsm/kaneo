import db from "../../database";
import { getDocumentOrThrow } from "../get-document-or-throw";

async function getDocument(id: string, workspaceId: string) {
  return getDocumentOrThrow(db, id, workspaceId);
}

export default getDocument;
