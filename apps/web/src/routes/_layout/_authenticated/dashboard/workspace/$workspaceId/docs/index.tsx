import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/docs/",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();

  return (
    <>
      <PageTitle title={t("documents:pageTitle")} />
      <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <FileText className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {t("documents:index.selectPrompt")}
        </p>
      </main>
    </>
  );
}
