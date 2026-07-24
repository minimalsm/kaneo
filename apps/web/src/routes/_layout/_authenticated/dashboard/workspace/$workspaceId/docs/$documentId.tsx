import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { DocEditor } from "@/components/docs/doc-editor";
import PageTitle from "@/components/page-title";
import useDocument from "@/hooks/queries/document/use-document";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/docs/$documentId",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { documentId } = Route.useParams();
  const { data: document } = useDocument({ id: documentId });

  return (
    <>
      <PageTitle title={document?.title ?? t("documents:pageTitle")} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <DocEditor key={documentId} documentId={documentId} />
      </main>
    </>
  );
}
