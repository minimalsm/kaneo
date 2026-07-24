import { useQuery } from "@tanstack/react-query";
import getDocuments from "@/fetchers/document/get-documents";

function useDocuments({
  workspaceId,
  archived = false,
}: {
  workspaceId: string;
  archived?: boolean;
}) {
  return useQuery({
    queryFn: () =>
      getDocuments({
        workspaceId,
        archived: archived ? "true" : undefined,
      }),
    queryKey: ["documents", workspaceId, archived],
    enabled: !!workspaceId,
  });
}

export default useDocuments;
