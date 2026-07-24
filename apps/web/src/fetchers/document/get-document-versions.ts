import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetDocumentVersionsRequest = InferRequestType<
  (typeof client)["document"][":id"]["versions"]["$get"]
>["param"];

async function getDocumentVersions({ id }: GetDocumentVersionsRequest) {
  const response = await client.document[":id"].versions.$get({
    param: { id },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default getDocumentVersions;
