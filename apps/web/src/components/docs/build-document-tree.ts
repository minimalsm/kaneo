export type DocumentTreeInput = {
  id: string;
  parentId: string | null;
  sortOrder: number;
};

export type DocumentTreeNode<T extends DocumentTreeInput> = T & {
  children: DocumentTreeNode<T>[];
};

export type VisibleTreeRow<T extends DocumentTreeInput> = {
  node: DocumentTreeNode<T>;
  depth: number;
  parentId: string | null;
};

/**
 * Builds a nested tree from the flat document list: group by `parentId`,
 * sort siblings by `sortOrder`. A dangling `parentId` (parent not present in
 * the fetched set, e.g. a stale cache row) falls back to root instead of
 * silently disappearing.
 */
export function buildDocumentTree<T extends DocumentTreeInput>(
  items: T[],
): DocumentTreeNode<T>[] {
  const nodesById = new Map<string, DocumentTreeNode<T>>();
  for (const item of items) {
    nodesById.set(item.id, { ...item, children: [] });
  }

  const roots: DocumentTreeNode<T>[] = [];
  for (const item of items) {
    const node = nodesById.get(item.id);
    if (!node) continue;
    const parent =
      item.parentId === null ? undefined : nodesById.get(item.parentId);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortLevel = (nodes: DocumentTreeNode<T>[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const node of nodes) {
      sortLevel(node.children);
    }
  };
  sortLevel(roots);

  return roots;
}

/**
 * Flattens the tree into the visually rendered row order, descending only
 * into nodes whose id is in `expandedIds`. Used for roving-focus arrow-key
 * navigation over the tree.
 */
export function flattenVisibleTree<T extends DocumentTreeInput>(
  nodes: DocumentTreeNode<T>[],
  expandedIds: ReadonlySet<string>,
): VisibleTreeRow<T>[] {
  const rows: VisibleTreeRow<T>[] = [];

  const visit = (
    levelNodes: DocumentTreeNode<T>[],
    depth: number,
    parentId: string | null,
  ) => {
    for (const node of levelNodes) {
      rows.push({ node, depth, parentId });
      if (node.children.length > 0 && expandedIds.has(node.id)) {
        visit(node.children, depth + 1, node.id);
      }
    }
  };
  visit(nodes, 0, null);

  return rows;
}
