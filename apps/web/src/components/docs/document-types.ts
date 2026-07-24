import type getDocuments from "@/fetchers/document/get-documents";

/** One row of the flat workspace document list returned by the list endpoint. */
export type DocumentListItem = NonNullable<
  Awaited<ReturnType<typeof getDocuments>>
>[number];
