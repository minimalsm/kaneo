import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type UnarchiveDocumentRequest = InferRequestType<
  (typeof client)["document"][":id"]["unarchive"]["$put"]
>["param"];

async function unarchiveDocument({ id }: UnarchiveDocumentRequest) {
  const response = await client.document[":id"].unarchive.$put({
    param: { id },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default unarchiveDocument;
