import { useMutation, useQueryClient } from "@tanstack/react-query";
import restoreDocumentVersion from "@/fetchers/document/restore-document-version";

function useRestoreDocumentVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreDocumentVersion,
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["document", variables.id], data);
      void queryClient.invalidateQueries({
        queryKey: ["document-versions", variables.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["documents", data.workspaceId],
      });
    },
  });
}

export default useRestoreDocumentVersion;
