import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetDocumentRequest = InferRequestType<
  (typeof client)["document"][":id"]["$get"]
>["param"];

async function getDocument({ id }: GetDocumentRequest) {
  const response = await client.document[":id"].$get({ param: { id } });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default getDocument;
