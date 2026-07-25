import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import WorkspaceTasksView from "@/components/workspace-tasks/workspace-tasks-view";

type WorkspaceTasksSearchParams = {
  taskId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/tasks",
)({
  component: RouteComponent,
  validateSearch: (
    search: Record<string, unknown>,
  ): WorkspaceTasksSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();

  return (
    <WorkspaceLayout title={t("workspaceTasks:pageTitle")}>
      <PageTitle title={t("workspaceTasks:pageTitle")} />
      <div className="flex h-full min-h-0 flex-col">
        <WorkspaceTasksView workspaceId={workspaceId} />
      </div>
    </WorkspaceLayout>
  );
}
