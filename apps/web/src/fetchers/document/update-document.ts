import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type UpdateDocumentRequest = InferRequestType<
  (typeof client)["document"][":id"]["$put"]
>["json"] &
  InferRequestType<(typeof client)["document"][":id"]["$put"]>["param"];

async function updateDocument({ id, title, content }: UpdateDocumentRequest) {
  const response = await client.document[":id"].$put({
    param: { id },
    json: { title, content },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default updateDocument;
