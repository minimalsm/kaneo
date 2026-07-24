import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateDocument from "@/fetchers/document/update-document";

// Used by the editor's debounced autosave: on success we write the server
// response into the ["document", id] cache with setQueryData instead of
// invalidating it, so an in-flight editor session is never clobbered by a
// refetch racing a newer local edit. The workspace list is invalidated so
// title changes propagate to the tree.
function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateDocument,
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["document", variables.id], data);
      void queryClient.invalidateQueries({
        queryKey: ["documents", data.workspaceId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["document-versions", variables.id],
      });
    },
  });
}

export default useUpdateDocument;
