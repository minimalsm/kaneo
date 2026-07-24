import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type MoveDocumentRequest = InferRequestType<
  (typeof client)["document"][":id"]["move"]["$put"]
>["json"] &
  InferRequestType<(typeof client)["document"][":id"]["move"]["$put"]>["param"];

async function moveDocument({ id, parentId, position }: MoveDocumentRequest) {
  const response = await client.document[":id"].move.$put({
    param: { id },
    json: { parentId, position },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default moveDocument;
