import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetDocumentsRequest = InferRequestType<
  (typeof client)["document"]["$get"]
>["query"];

async function getDocuments({ workspaceId, archived }: GetDocumentsRequest) {
  if (!workspaceId) return;

  const response = await client.document.$get({
    query: { workspaceId, archived },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default getDocuments;
