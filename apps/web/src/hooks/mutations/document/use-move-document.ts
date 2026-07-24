import { useMutation, useQueryClient } from "@tanstack/react-query";
import moveDocument from "@/fetchers/document/move-document";

function useMoveDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: moveDocument,
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["document", variables.id], data);
      void queryClient.invalidateQueries({
        queryKey: ["documents", data.workspaceId],
      });
    },
  });
}

export default useMoveDocument;
