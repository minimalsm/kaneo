import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { DocEditor } from "@/components/docs/doc-editor";
import { DocsTree } from "@/components/docs/docs-tree";
import PageTitle from "@/components/page-title";
import useDocument from "@/hooks/queries/document/use-document";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/docs/$documentId",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId, documentId } = Route.useParams();
  const { data: document } = useDocument({ id: documentId });

  return (
    <>
      <PageTitle title={document?.title ?? t("documents:pageTitle")} />
      <WorkspaceLayout title={t("documents:pageTitle")}>
        <div className="flex h-full min-h-0">
          <aside className="w-64 shrink-0 overflow-y-auto border-e border-border/60 bg-card/50">
            <DocsTree
              selectedDocumentId={documentId}
              workspaceId={workspaceId}
            />
          </aside>
          <main className="min-w-0 flex-1 overflow-y-auto">
            <DocEditor key={documentId} documentId={documentId} />
          </main>
        </div>
      </WorkspaceLayout>
    </>
  );
}
