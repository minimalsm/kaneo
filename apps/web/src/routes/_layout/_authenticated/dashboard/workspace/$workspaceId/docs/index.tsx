import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { DocsTree } from "@/components/docs/docs-tree";
import PageTitle from "@/components/page-title";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/docs/",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();

  return (
    <>
      <PageTitle title={t("documents:pageTitle")} />
      <WorkspaceLayout title={t("documents:pageTitle")}>
        <div className="flex h-full min-h-0">
          <aside className="w-64 shrink-0 overflow-y-auto border-e border-border/60 bg-card/50">
            <DocsTree workspaceId={workspaceId} />
          </aside>
          <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <FileText className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("documents:index.selectPrompt")}
            </p>
          </main>
        </div>
      </WorkspaceLayout>
    </>
  );
}
