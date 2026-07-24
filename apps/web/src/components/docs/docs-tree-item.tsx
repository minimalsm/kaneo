import {
  Archive,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  FilePlus,
  FileText,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import type { DocumentTreeNode } from "./build-document-tree";
import type { DocumentListItem } from "./document-types";

type DocsTreeItemProps = {
  node: DocumentTreeNode<DocumentListItem>;
  depth: number;
  /** Parent id as rendered in the tree (null at root, incl. dangling fallback). */
  parentId: string | null;
  index: number;
  siblingCount: number;
  selectedDocumentId?: string;
  expandedIds: ReadonlySet<string>;
  focusableId: string | null;
  renamingId: string | null;
  canCreate: boolean;
  canUpdate: boolean;
  onToggleExpand: (id: string) => void;
  onSelect: (node: DocumentTreeNode<DocumentListItem>) => void;
  onItemKeyDown: (event: KeyboardEvent, id: string) => void;
  onCreateChild: (node: DocumentTreeNode<DocumentListItem>) => void;
  onStartRename: (id: string) => void;
  onCommitRename: (
    node: DocumentTreeNode<DocumentListItem>,
    title: string,
  ) => void;
  onCancelRename: () => void;
  onArchive: (node: DocumentTreeNode<DocumentListItem>) => void;
  onMove: (
    node: DocumentTreeNode<DocumentListItem>,
    parentId: string | null,
    position: number,
  ) => void;
  registerItem: (id: string, element: HTMLElement | null) => void;
};

function RenameInput({
  initialTitle,
  onCommit,
  onCancel,
}: {
  initialTitle: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialTitle);

  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: inline rename should focus immediately
      autoFocus
      aria-label={t("documents:tree.renameLabel")}
      className="h-6 w-full min-w-0 flex-1 rounded-sm border border-input bg-background px-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onBlur={() => onCommit(value)}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      type="text"
      value={value}
    />
  );
}

export function DocsTreeItem(props: DocsTreeItemProps) {
  const {
    node,
    depth,
    parentId,
    index,
    siblingCount,
    selectedDocumentId,
    expandedIds,
    focusableId,
    renamingId,
    canCreate,
    canUpdate,
    onToggleExpand,
    onSelect,
    onItemKeyDown,
    onCreateChild,
    onStartRename,
    onCommitRename,
    onCancelRename,
    onArchive,
    onMove,
    registerItem,
  } = props;
  const { t } = useTranslation();

  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedDocumentId === node.id;
  const isRenaming = renamingId === node.id;
  const showMenu = canCreate || canUpdate;

  return (
    <div
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-level={depth + 1}
      aria-selected={isSelected}
      className="outline-none"
      onClick={(event) => {
        // Nested treeitems bubble through their ancestors; only the innermost
        // clicked item should be selected.
        event.stopPropagation();
        if (!isRenaming) onSelect(node);
      }}
      onKeyDown={(event) => {
        if (isRenaming) return;
        onItemKeyDown(event, node.id);
      }}
      ref={(element) => registerItem(node.id, element)}
      role="treeitem"
      tabIndex={focusableId === node.id ? 0 : -1}
    >
      <div
        aria-current={isSelected ? "page" : undefined}
        className={cn(
          "group/doc-row flex h-7 cursor-pointer items-center gap-1 rounded-md pe-1 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isSelected && "bg-sidebar-accent text-sidebar-accent-foreground",
        )}
        style={{ paddingInlineStart: `${depth * 12 + 4}px` }}
      >
        {hasChildren ? (
          <button
            aria-label={
              isExpanded
                ? t("documents:tree.collapse")
                : t("documents:tree.expand")
            }
            className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand(node.id);
            }}
            tabIndex={-1}
            type="button"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform duration-150",
                isExpanded && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span aria-hidden="true" className="size-4 shrink-0" />
        )}
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        {isRenaming ? (
          <RenameInput
            initialTitle={node.title}
            onCancel={onCancelRename}
            onCommit={(title) => onCommitRename(node, title)}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{node.title}</span>
        )}
        {showMenu && !isRenaming && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  aria-label={t("documents:tree.actions.menu")}
                  className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:opacity-100 md:opacity-0 md:group-hover/doc-row:opacity-100"
                  onClick={(event) => event.stopPropagation()}
                  tabIndex={-1}
                  type="button"
                />
              }
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44 rounded-lg">
              {canCreate && (
                <DropdownMenuItem
                  className="h-7 cursor-pointer items-start text-sm"
                  onClick={() => onCreateChild(node)}
                >
                  <FilePlus className="text-muted-foreground" />
                  <span>{t("documents:tree.actions.createChild")}</span>
                </DropdownMenuItem>
              )}
              {canUpdate && (
                <>
                  <DropdownMenuItem
                    className="h-7 cursor-pointer items-start text-sm"
                    onClick={() => onStartRename(node.id)}
                  >
                    <Pencil className="text-muted-foreground" />
                    <span>{t("documents:tree.actions.rename")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="h-7 cursor-pointer items-start text-sm"
                    disabled={index === 0}
                    onClick={() => onMove(node, parentId, index - 1)}
                  >
                    <ArrowUp className="text-muted-foreground" />
                    <span>{t("documents:tree.actions.moveUp")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="h-7 cursor-pointer items-start text-sm"
                    disabled={index >= siblingCount - 1}
                    onClick={() => onMove(node, parentId, index + 1)}
                  >
                    <ArrowDown className="text-muted-foreground" />
                    <span>{t("documents:tree.actions.moveDown")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="h-7 cursor-pointer items-start text-sm"
                    onClick={() => onArchive(node)}
                  >
                    <Archive className="text-muted-foreground" />
                    <span>{t("documents:tree.actions.archive")}</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {hasChildren && isExpanded && (
        // biome-ignore lint/a11y/useSemanticElements: the ARIA tree pattern requires role="group" for nested treeitem containers
        <div role="group">
          {node.children.map((child, childIndex) => (
            <DocsTreeItem
              {...props}
              depth={depth + 1}
              index={childIndex}
              key={child.id}
              node={child}
              parentId={node.id}
              siblingCount={node.children.length}
            />
          ))}
        </div>
      )}
    </div>
  );
}
