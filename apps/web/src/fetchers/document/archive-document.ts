import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type ArchiveDocumentRequest = InferRequestType<
  (typeof client)["document"][":id"]["archive"]["$put"]
>["param"];

async function archiveDocument({ id }: ArchiveDocumentRequest) {
  const response = await client.document[":id"].archive.$put({
    param: { id },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default archiveDocument;
