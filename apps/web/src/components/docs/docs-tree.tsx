import { useNavigate } from "@tanstack/react-router";
import {
  ArchiveRestore,
  ChevronRight,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import useArchiveDocument from "@/hooks/mutations/document/use-archive-document";
import useCreateDocument from "@/hooks/mutations/document/use-create-document";
import useDeleteDocument from "@/hooks/mutations/document/use-delete-document";
import useMoveDocument from "@/hooks/mutations/document/use-move-document";
import useUpdateDocument from "@/hooks/mutations/document/use-update-document";
import useDocuments from "@/hooks/queries/document/use-documents";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import {
  buildDocumentTree,
  type DocumentTreeNode,
  flattenVisibleTree,
} from "./build-document-tree";
import { DocsTreeItem } from "./docs-tree-item";
import type { DocumentListItem } from "./document-types";

type DocsTreeProps = {
  workspaceId: string;
  selectedDocumentId?: string;
};

export function DocsTree({ workspaceId, selectedDocumentId }: DocsTreeProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const {
    data: documents,
    isLoading,
    isError,
    refetch,
  } = useDocuments({ workspaceId });

  const [showArchived, setShowArchived] = useState(false);
  const { data: archivedDocuments, isLoading: isArchivedLoading } =
    useDocuments({
      workspaceId: showArchived ? workspaceId : "",
      archived: true,
    });

  const { canCreateDocuments, canUpdateDocuments, canDeleteDocuments } =
    useWorkspacePermission();
  const canCreate = canCreateDocuments();
  const canUpdate = canUpdateDocuments();
  const canDelete = canDeleteDocuments();

  const createDocument = useCreateDocument();
  const updateDocument = useUpdateDocument();
  const moveDocument = useMoveDocument();
  const archiveDocument = useArchiveDocument();
  const deleteDocument = useDeleteDocument();

  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentListItem | null>(
    null,
  );
  const itemRefs = useRef(new Map<string, HTMLElement>());

  const tree = useMemo(() => buildDocumentTree(documents ?? []), [documents]);
  const visibleRows = useMemo(
    () => flattenVisibleTree(tree, expandedIds),
    [tree, expandedIds],
  );

  // Keep the selected doc reachable: expand its ancestor chain whenever the
  // selection or the fetched list changes.
  useEffect(() => {
    if (!selectedDocumentId || !documents) return;
    const byId = new Map(documents.map((item) => [item.id, item]));
    const ancestors: string[] = [];
    let current = byId.get(selectedDocumentId)?.parentId ?? null;
    while (current !== null) {
      const parent = byId.get(current);
      if (!parent) break;
      ancestors.push(parent.id);
      current = parent.parentId;
    }
    if (ancestors.length === 0) return;
    setExpandedIds((previous) => {
      if (ancestors.every((id) => previous.has(id))) return previous;
      return new Set([...previous, ...ancestors]);
    });
  }, [selectedDocumentId, documents]);

  const onActionError = (error: unknown) => {
    toast.error(
      error instanceof Error && error.message
        ? error.message
        : t("documents:errors.actionFailed"),
    );
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const openDocument = (id: string) => {
    void navigate({
      to: "/dashboard/workspace/$workspaceId/docs/$documentId",
      params: { workspaceId, documentId: id },
    });
  };

  const handleCreate = async (parentId?: string) => {
    try {
      const created = await createDocument.mutateAsync({
        workspaceId,
        parentId,
      });
      if (parentId) {
        setExpandedIds((previous) => new Set([...previous, parentId]));
      }
      openDocument(created.id);
    } catch (error) {
      onActionError(error);
    }
  };

  const handleCommitRename = (
    node: DocumentTreeNode<DocumentListItem>,
    title: string,
  ) => {
    setRenamingId(null);
    const trimmed = title.trim();
    if (!trimmed || trimmed === node.title) return;
    updateDocument.mutate(
      { id: node.id, title: trimmed },
      { onError: onActionError },
    );
  };

  const handleMove = (
    node: DocumentTreeNode<DocumentListItem>,
    parentId: string | null,
    position: number,
  ) => {
    moveDocument.mutate(
      { id: node.id, parentId, position },
      { onError: onActionError },
    );
  };

  const handleArchive = (node: DocumentTreeNode<DocumentListItem>) => {
    archiveDocument.mutate(
      { id: node.id },
      {
        onError: onActionError,
        onSuccess: () => {
          if (
            selectedDocumentId &&
            (node.id === selectedDocumentId ||
              hasDescendant(node, selectedDocumentId))
          ) {
            void navigate({
              to: "/dashboard/workspace/$workspaceId/docs",
              params: { workspaceId },
            });
          }
        },
      },
    );
  };

  const handleUnarchive = (id: string) => {
    archiveDocument.mutate({ id, archived: false }, { onError: onActionError });
  };

  const handleDelete = (id: string) => {
    deleteDocument.mutate(
      { id },
      {
        onError: onActionError,
        onSuccess: () => {
          if (selectedDocumentId === id) {
            void navigate({
              to: "/dashboard/workspace/$workspaceId/docs",
              params: { workspaceId },
            });
          }
        },
      },
    );
  };

  const focusItem = (id: string) => {
    setFocusedId(id);
    itemRefs.current.get(id)?.focus();
  };

  const handleItemKeyDown = (event: KeyboardEvent, id: string) => {
    const rowIndex = visibleRows.findIndex((row) => row.node.id === id);
    if (rowIndex === -1) return;
    const row = visibleRows[rowIndex];
    if (!row) return;

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = visibleRows[rowIndex + 1];
        if (next) focusItem(next.node.id);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const previous = visibleRows[rowIndex - 1];
        if (previous) focusItem(previous.node.id);
        break;
      }
      case "ArrowRight": {
        event.preventDefault();
        if (row.node.children.length === 0) break;
        if (expandedIds.has(id)) {
          const firstChild = row.node.children[0];
          if (firstChild) focusItem(firstChild.id);
        } else {
          toggleExpand(id);
        }
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        if (expandedIds.has(id) && row.node.children.length > 0) {
          toggleExpand(id);
        } else if (row.parentId) {
          focusItem(row.parentId);
        }
        break;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        openDocument(id);
        break;
      }
      default:
        break;
    }
  };

  const registerItem = (id: string, element: HTMLElement | null) => {
    if (element) {
      itemRefs.current.set(id, element);
    } else {
      itemRefs.current.delete(id);
    }
  };

  const focusableId =
    (focusedId && visibleRows.some((row) => row.node.id === focusedId)
      ? focusedId
      : null) ??
    (selectedDocumentId &&
    visibleRows.some((row) => row.node.id === selectedDocumentId)
      ? selectedDocumentId
      : null) ??
    visibleRows[0]?.node.id ??
    null;

  const isEmpty = !isLoading && !isError && tree.length === 0;

  return (
    <div className="flex h-full flex-col gap-1 overflow-y-auto p-2">
      <div className="flex h-7 shrink-0 items-center justify-between ps-1">
        <span className="text-xs font-medium text-sidebar-accent-foreground">
          {t("documents:tree.label")}
        </span>
        {canCreate && !isEmpty && (
          <Button
            aria-label={t("documents:tree.createDocument")}
            className="size-6"
            onClick={() => void handleCreate()}
            size="icon-xs"
            variant="ghost"
          >
            <Plus />
          </Button>
        )}
      </div>

      {isLoading && (
        <div aria-hidden="true" className="flex flex-col gap-1.5 p-1">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-6 w-3/5" />
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="text-destructive-foreground">
            {t("documents:errors.loadFailed")}
          </p>
          <Button onClick={() => void refetch()} size="xs" variant="outline">
            <RefreshCw />
            {t("common:error.tryAgain")}
          </Button>
        </div>
      )}

      {isEmpty && (
        <Empty className="p-4 md:p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle className="text-sm">
              {t("documents:empty.title")}
            </EmptyTitle>
            <EmptyDescription className="text-xs">
              {canCreate
                ? t("documents:empty.description")
                : t("documents:empty.descriptionReadOnly")}
            </EmptyDescription>
          </EmptyHeader>
          {canCreate && (
            <EmptyContent>
              <Button onClick={() => void handleCreate()} size="xs">
                <Plus />
                {t("documents:empty.action")}
              </Button>
            </EmptyContent>
          )}
        </Empty>
      )}

      {!isLoading && !isError && tree.length > 0 && (
        <div
          aria-label={t("documents:tree.label")}
          className="flex-1"
          role="tree"
        >
          {tree.map((node, index) => (
            <DocsTreeItem
              canCreate={canCreate}
              canUpdate={canUpdate}
              depth={0}
              expandedIds={expandedIds}
              focusableId={focusableId}
              index={index}
              key={node.id}
              node={node}
              onArchive={handleArchive}
              onCancelRename={() => setRenamingId(null)}
              onCommitRename={handleCommitRename}
              onCreateChild={(node) => void handleCreate(node.id)}
              onItemKeyDown={handleItemKeyDown}
              onMove={handleMove}
              onSelect={(node) => openDocument(node.id)}
              onStartRename={setRenamingId}
              onToggleExpand={toggleExpand}
              parentId={null}
              registerItem={registerItem}
              renamingId={renamingId}
              selectedDocumentId={selectedDocumentId}
              siblingCount={tree.length}
            />
          ))}
        </div>
      )}

      <div className="mt-auto shrink-0 border-t border-border/60 pt-1">
        <button
          aria-expanded={showArchived}
          className="flex h-7 w-full items-center gap-1 rounded-md px-1 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => setShowArchived((previous) => !previous)}
          type="button"
        >
          <ChevronRight
            className={cn(
              "size-3.5 transition-transform duration-150",
              showArchived && "rotate-90",
            )}
          />
          {showArchived
            ? t("documents:archived.hide")
            : t("documents:archived.show")}
        </button>
        {showArchived && (
          <div className="ps-1">
            {isArchivedLoading && (
              <div aria-hidden="true" className="flex flex-col gap-1.5 p-1">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-3/5" />
              </div>
            )}
            {!isArchivedLoading &&
              (archivedDocuments?.length ? (
                <ul
                  aria-label={t("documents:archived.listLabel")}
                  className="m-0 list-none p-0"
                >
                  {archivedDocuments.map((archivedDocument) => (
                    <li
                      className="group/doc-row flex h-7 items-center gap-1 rounded-md px-1 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      key={archivedDocument.id}
                    >
                      <FileText className="size-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        {archivedDocument.title}
                      </span>
                      {canUpdate && (
                        <Button
                          aria-label={t("documents:archived.unarchive")}
                          className="size-5"
                          onClick={() => handleUnarchive(archivedDocument.id)}
                          size="icon-xs"
                          variant="ghost"
                        >
                          <ArchiveRestore />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          aria-label={t("documents:archived.delete")}
                          className="size-5 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(archivedDocument)}
                          size="icon-xs"
                          variant="ghost"
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-1 py-1.5 text-xs text-muted-foreground">
                  {t("documents:archived.empty")}
                </p>
              ))}
          </div>
        )}
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("documents:deleteConfirm.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("documents:deleteConfirm.description", {
                title: deleteTarget?.title ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose>
              <Button size="sm" variant="outline">
                {t("common:actions.cancel")}
              </Button>
            </AlertDialogClose>
            <AlertDialogClose
              onClick={() => {
                if (deleteTarget) handleDelete(deleteTarget.id);
              }}
            >
              <Button size="sm" variant="destructive">
                {t("common:actions.delete")}
              </Button>
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function hasDescendant(
  node: DocumentTreeNode<DocumentListItem>,
  id: string,
): boolean {
  return node.children.some(
    (child) => child.id === id || hasDescendant(child, id),
  );
}
