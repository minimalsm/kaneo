import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type RestoreDocumentVersionRequest = InferRequestType<
  (typeof client)["document"][":id"]["versions"][":versionId"]["restore"]["$put"]
>["param"];

async function restoreDocumentVersion({
  id,
  versionId,
}: RestoreDocumentVersionRequest) {
  const response = await client.document[":id"].versions[
    ":versionId"
  ].restore.$put({
    param: { id, versionId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default restoreDocumentVersion;
