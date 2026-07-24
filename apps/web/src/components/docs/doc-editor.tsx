import { useTranslation } from "react-i18next";
import { ErrorDisplay } from "@/components/ui/error-display";
import { Skeleton } from "@/components/ui/skeleton";
import useDocument from "@/hooks/queries/document/use-document";

type DocEditorProps = {
  documentId: string;
};

/**
 * Placeholder editor pane for a document (U6). U7 replaces the body with the
 * Tiptap editor; the shell route only depends on this component's props.
 */
export function DocEditor({ documentId }: DocEditorProps) {
  const { t } = useTranslation();
  const {
    data: document,
    isLoading,
    isError,
    error,
    refetch,
  } = useDocument({ id: documentId });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-8">
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (isError) {
    return <ErrorDisplay error={error} onRetry={() => void refetch()} />;
  }

  if (!document) return null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-8">
      <h1 className="font-heading font-semibold text-2xl text-foreground">
        {document.title}
      </h1>
      <p className="text-sm text-muted-foreground">
        {t("documents:editor.readOnlyNote")}
      </p>
    </div>
  );
}
