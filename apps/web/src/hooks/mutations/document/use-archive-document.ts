import { useMutation, useQueryClient } from "@tanstack/react-query";
import archiveDocument from "@/fetchers/document/archive-document";
import unarchiveDocument from "@/fetchers/document/unarchive-document";

// Covers both archive and unarchive; pass `archived: false` to unarchive.
// Invalidating ["documents", workspaceId] covers both the active and the
// archived list variants since the archived flag is a deeper key element.
function useArchiveDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      archived = true,
    }: {
      id: string;
      archived?: boolean;
    }) => (archived ? archiveDocument({ id }) : unarchiveDocument({ id })),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["document", variables.id], data);
      void queryClient.invalidateQueries({
        queryKey: ["documents", data.workspaceId],
      });
    },
  });
}

export default useArchiveDocument;
