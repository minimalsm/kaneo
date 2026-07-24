import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type DeleteDocumentRequest = InferRequestType<
  (typeof client)["document"][":id"]["$delete"]
>["param"];

async function deleteDocument({ id }: DeleteDocumentRequest) {
  const response = await client.document[":id"].$delete({ param: { id } });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default deleteDocument;
