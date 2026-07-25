import { useTranslation } from "react-i18next";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import {
  DUE_FILTER_VALUES,
  PRIORITY_VALUES,
  SORT_BY_VALUES,
  STATUS_VALUES,
  type WorkspaceTasksFilters,
} from "./workspace-tasks-filters";

type WorkspaceTasksFilterBarProps = {
  workspaceId: string;
  filters: WorkspaceTasksFilters;
  onFiltersChange: (filters: WorkspaceTasksFilters) => void;
};

export function WorkspaceTasksFilterBar({
  workspaceId,
  filters,
  onFiltersChange,
}: WorkspaceTasksFilterBarProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);

  const members = (workspaceUsers?.members ?? []).filter(
    (member) => member.userId !== user?.id,
  );

  const update = (patch: Partial<WorkspaceTasksFilters>) => {
    onFiltersChange({ ...filters, ...patch });
  };

  const assigneeLabel = (value: string) => {
    if (value === "me") return t("workspaceTasks:filters.me");
    if (value === "everyone") return t("workspaceTasks:filters.everyone");
    if (value === "unassigned") return t("tasks:assignee.unassigned");
    const member = workspaceUsers?.members?.find((m) => m.userId === value);
    return member?.user?.name ?? value;
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-2"
      role="toolbar"
      aria-label={t("workspaceTasks:filters.toolbarLabel")}
    >
      <Select
        value={filters.assignee}
        onValueChange={(value) => {
          if (typeof value === "string") update({ assignee: value });
        }}
      >
        <SelectTrigger
          size="sm"
          className="w-auto"
          aria-label={t("tasks:assignee.label")}
        >
          <SelectValue>{assigneeLabel(filters.assignee)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="me">{t("workspaceTasks:filters.me")}</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.userId} value={member.userId}>
              {member.user?.name ?? member.userId}
            </SelectItem>
          ))}
          <SelectItem value="unassigned">
            {t("tasks:assignee.unassigned")}
          </SelectItem>
          <SelectItem value="everyone">
            {t("workspaceTasks:filters.everyone")}
          </SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.status}
        onValueChange={(value) => {
          if (typeof value === "string") update({ status: value });
        }}
      >
        <SelectTrigger
          size="sm"
          className="w-auto"
          aria-label={t("tasks:status.label")}
        >
          <SelectValue>
            {filters.status === "all"
              ? t("workspaceTasks:filters.allStatuses")
              : t(`tasks:status.${filters.status}`, {
                  defaultValue: filters.status,
                })}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            {t("workspaceTasks:filters.allStatuses")}
          </SelectItem>
          {STATUS_VALUES.map((status) => (
            <SelectItem key={status} value={status}>
              {t(`tasks:status.${status}`, { defaultValue: status })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.priority}
        onValueChange={(value) => {
          if (typeof value === "string") update({ priority: value });
        }}
      >
        <SelectTrigger
          size="sm"
          className="w-auto"
          aria-label={t("tasks:priority.label")}
        >
          <SelectValue>
            {filters.priority === "all"
              ? t("workspaceTasks:filters.allPriorities")
              : t(`tasks:priority.${filters.priority}`, {
                  defaultValue: filters.priority,
                })}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            {t("workspaceTasks:filters.allPriorities")}
          </SelectItem>
          {PRIORITY_VALUES.map((priority) => (
            <SelectItem key={priority} value={priority}>
              {t(`tasks:priority.${priority}`, { defaultValue: priority })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.due}
        onValueChange={(value) => {
          if (typeof value === "string") {
            update({ due: value as WorkspaceTasksFilters["due"] });
          }
        }}
      >
        <SelectTrigger
          size="sm"
          className="w-auto"
          aria-label={t("workspaceTasks:filters.dueLabel")}
        >
          <SelectValue>
            {t(`workspaceTasks:filters.due.${filters.due}`)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {DUE_FILTER_VALUES.map((due) => (
            <SelectItem key={due} value={due}>
              {t(`workspaceTasks:filters.due.${due}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.sortBy}
        onValueChange={(value) => {
          if (typeof value === "string") {
            update({ sortBy: value as WorkspaceTasksFilters["sortBy"] });
          }
        }}
      >
        <SelectTrigger
          size="sm"
          className="w-auto"
          aria-label={t("workspaceTasks:filters.sortLabel")}
        >
          <SelectValue>
            {t(`workspaceTasks:filters.sort.${filters.sortBy}`)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SORT_BY_VALUES.map((sortBy) => (
            <SelectItem key={sortBy} value={sortBy}>
              {t(`workspaceTasks:filters.sort.${sortBy}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default WorkspaceTasksFilterBar;
