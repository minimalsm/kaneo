import { History, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import useRestoreDocumentVersion from "@/hooks/mutations/document/use-restore-document-version";
import useDocumentVersions from "@/hooks/queries/document/use-document-versions";
import useGetWorkspaceUsers from "@/hooks/queries/workspace-users/use-get-workspace-users";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { toast } from "@/lib/toast";

type DocVersionHistoryProps = {
  documentId: string;
  workspaceId: string;
};

type DocumentVersionItem = {
  id: string;
  documentId: string;
  createdBy: string;
  createdAt: string;
};

export function DocVersionHistory({
  documentId,
  workspaceId,
}: DocVersionHistoryProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] =
    useState<DocumentVersionItem | null>(null);

  // Fetch only while the dialog is open (the hooks are disabled on falsy ids).
  const {
    data: versions,
    isLoading,
    isError,
    refetch,
  } = useDocumentVersions({ id: open ? documentId : "" });
  const { data: workspaceUsers } = useGetWorkspaceUsers({
    workspaceId: open ? workspaceId : undefined,
  });
  const { mutate: restoreVersion, isPending: isRestoring } =
    useRestoreDocumentVersion();
  const { canUpdateDocuments } = useWorkspacePermission();
  const canRestore = canUpdateDocuments();

  // The API returns versions newest-first (server-side orderBy desc).
  const versionList = (versions as DocumentVersionItem[] | undefined) ?? [];

  const authorNameById = useMemo(() => {
    const byId = new Map<string, string>();
    for (const member of workspaceUsers ?? []) {
      const name = member.user?.name || member.user?.email;
      if (member.userId && name) byId.set(member.userId, name);
    }
    return byId;
  }, [workspaceUsers]);

  const handleRestore = (version: DocumentVersionItem) => {
    restoreVersion(
      { id: documentId, versionId: version.id },
      {
        onSuccess: () => {
          toast.success(t("documents:versionHistory.restoreSuccess"));
          setOpen(false);
        },
        onError: (error) => {
          toast.error(
            error instanceof Error && error.message
              ? error.message
              : t("documents:errors.actionFailed"),
          );
        },
      },
    );
  };

  return (
    <>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger
          render={
            <Button
              className="shrink-0 text-muted-foreground"
              size="xs"
              variant="ghost"
            />
          }
        >
          <History className="size-3.5" />
          {t("documents:versionHistory.trigger")}
        </DialogTrigger>
        <DialogPopup className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("documents:versionHistory.title")}</DialogTitle>
            <DialogDescription>
              {canRestore
                ? t("documents:versionHistory.description")
                : t("documents:versionHistory.descriptionReadOnly")}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {isLoading && (
              <div aria-hidden="true" className="flex flex-col gap-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-2/3" />
              </div>
            )}

            {isError && (
              <div className="flex flex-col items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="text-destructive-foreground">
                  {t("documents:versionHistory.loadFailed")}
                </p>
                <Button
                  onClick={() => void refetch()}
                  size="xs"
                  variant="outline"
                >
                  <RefreshCw />
                  {t("common:error.tryAgain")}
                </Button>
              </div>
            )}

            {!isLoading && !isError && versionList.length === 0 && (
              <Empty className="p-4 md:p-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <History />
                  </EmptyMedia>
                  <EmptyTitle className="text-sm">
                    {t("documents:versionHistory.empty.title")}
                  </EmptyTitle>
                  <EmptyDescription className="text-xs">
                    {t("documents:versionHistory.empty.description")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}

            {!isLoading && !isError && versionList.length > 0 && (
              <ul
                aria-label={t("documents:versionHistory.listLabel")}
                className="m-0 flex list-none flex-col gap-1 p-0"
              >
                {versionList.map((version) => (
                  <li
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50"
                    key={version.id}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span
                        className="truncate text-foreground"
                        title={formatDateTime(version.createdAt)}
                      >
                        {formatRelativeTime(version.createdAt)}
                      </span>
                      <span className="truncate text-muted-foreground text-xs">
                        {authorNameById.get(version.createdBy) ??
                          t("documents:versionHistory.unknownUser")}
                      </span>
                    </div>
                    {canRestore && (
                      <Button
                        className="shrink-0"
                        disabled={isRestoring}
                        onClick={() => setRestoreTarget(version)}
                        size="xs"
                        variant="outline"
                      >
                        {t("documents:versionHistory.restore")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </DialogPanel>
        </DialogPopup>
      </Dialog>

      <AlertDialog
        onOpenChange={(confirmOpen) => {
          if (!confirmOpen) setRestoreTarget(null);
        }}
        open={restoreTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("documents:versionHistory.restoreConfirm.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("documents:versionHistory.restoreConfirm.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button size="sm" variant="outline" />}>
              {t("common:actions.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              onClick={() => {
                if (restoreTarget) handleRestore(restoreTarget);
              }}
              render={<Button size="sm" />}
            >
              {t("documents:versionHistory.restoreConfirm.confirm")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
