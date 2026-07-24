import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type CreateDocumentRequest = InferRequestType<
  (typeof client)["document"]["$post"]
>["json"];

async function createDocument({
  workspaceId,
  title,
  parentId,
  projectId,
}: CreateDocumentRequest) {
  const response = await client.document.$post({
    json: { workspaceId, title, parentId, projectId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default createDocument;
