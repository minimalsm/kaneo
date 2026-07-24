import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { DocsTree } from "@/components/docs/docs-tree";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/docs",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  // Present only when the $documentId child route is active; keeps the tree
  // mounted (expand state, no remount flicker) while the right pane swaps.
  const { documentId } = useParams({ strict: false });

  return (
    <WorkspaceLayout title={t("documents:pageTitle")}>
      <div className="flex h-full min-h-0">
        <aside className="w-64 shrink-0 overflow-y-auto border-e border-border/60 bg-card/50">
          <DocsTree selectedDocumentId={documentId} workspaceId={workspaceId} />
        </aside>
        <Outlet />
      </div>
    </WorkspaceLayout>
  );
}
