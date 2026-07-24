import { useQuery } from "@tanstack/react-query";
import getDocumentVersions from "@/fetchers/document/get-document-versions";

function useDocumentVersions({ id }: { id: string }) {
  return useQuery({
    queryFn: () => getDocumentVersions({ id }),
    queryKey: ["document-versions", id],
    enabled: !!id,
  });
}

export default useDocumentVersions;
