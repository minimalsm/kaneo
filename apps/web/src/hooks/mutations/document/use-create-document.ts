import { useMutation, useQueryClient } from "@tanstack/react-query";
import createDocument from "@/fetchers/document/create-document";

function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createDocument,
    onSuccess: (data, variables) => {
      // Seed the doc query so navigating to the new document paints
      // immediately instead of flashing the editor's loading skeleton.
      queryClient.setQueryData(["document", data.id], data);
      void queryClient.invalidateQueries({
        queryKey: ["documents", variables.workspaceId],
      });
    },
  });
}

export default useCreateDocument;
