import { useQuery } from "@tanstack/react-query";
import getDocument from "@/fetchers/document/get-document";

function useDocument({ id }: { id: string }) {
  return useQuery({
    queryFn: () => getDocument({ id }),
    queryKey: ["document", id],
    enabled: !!id,
  });
}

export default useDocument;
