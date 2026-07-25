import { format } from "date-fns";
import { Calendar, CalendarClock, CalendarX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { WorkspaceTaskRow as WorkspaceTaskRowData } from "@/fetchers/task/get-workspace-tasks";
import { dueDateStatusColors, getDueDateStatus } from "@/lib/due-date-status";
import { getInitials } from "@/lib/get-initials";
import { getPriorityIcon } from "@/lib/priority";

type WorkspaceTaskRowProps = {
  task: WorkspaceTaskRowData;
  onOpen: (task: WorkspaceTaskRowData) => void;
};

export function WorkspaceTaskRow({ task, onOpen }: WorkspaceTaskRowProps) {
  const { t } = useTranslation();

  const dueDateStatus = getDueDateStatus(
    task.dueDate ? String(task.dueDate) : null,
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(task);
    }
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: flex row layout mirrors task-row.tsx; role="button" + tabIndex + Enter/Space handlers provide full button semantics
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={handleKeyDown}
      className="group relative flex cursor-pointer items-center gap-3 border-b border-border/50 px-4 py-1.5 transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
    >
      <div className="flex-shrink-0 first:[&_svg]:h-4 first:[&_svg]:w-4">
        {getPriorityIcon(task.priority ?? "")}
      </div>
      <div className="flex-shrink-0 font-mono text-xs text-muted-foreground">
        {task.projectSlug}-{task.number}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm text-foreground">{task.title}</span>
      </div>
      <span className="flex-shrink-0 rounded bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">
        {t(`tasks:status.${task.status}`, { defaultValue: task.status })}
      </span>
      {task.dueDate && (
        <div
          className={`flex flex-shrink-0 items-center gap-1 rounded px-2 py-1 text-[10px] ${dueDateStatusColors[dueDateStatus]}`}
        >
          {dueDateStatus === "overdue" && <CalendarX className="h-3 w-3" />}
          {dueDateStatus === "due-soon" && (
            <CalendarClock className="h-3 w-3" />
          )}
          {(dueDateStatus === "far-future" ||
            dueDateStatus === "no-due-date") && (
            <Calendar className="h-3 w-3" />
          )}
          <span>{format(new Date(task.dueDate), "MMM d")}</span>
        </div>
      )}
      <div className="flex-shrink-0">
        {task.userId ? (
          <Avatar className="h-6 w-6">
            <AvatarImage
              src={task.assigneeImage ?? ""}
              alt={task.assigneeName ?? ""}
            />
            <AvatarFallback className="border border-border/30 text-xs font-medium">
              {getInitials(task.assigneeName ?? undefined)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-muted"
            title={t("tasks:assignee.unassigned")}
          >
            <span className="text-[10px] font-medium text-muted-foreground">
              ?
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default WorkspaceTaskRow;
