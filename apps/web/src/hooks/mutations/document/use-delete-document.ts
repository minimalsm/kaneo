import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteDocument from "@/fetchers/document/delete-document";

function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteDocument,
    onSuccess: (data, variables) => {
      queryClient.removeQueries({ queryKey: ["document", variables.id] });
      queryClient.removeQueries({
        queryKey: ["document-versions", variables.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["documents", data.workspaceId],
      });
    },
  });
}

export default useDeleteDocument;
