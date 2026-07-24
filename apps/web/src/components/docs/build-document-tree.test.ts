import { describe, expect, it } from "vitest";
import { buildDocumentTree, flattenVisibleTree } from "./build-document-tree";

function doc(id: string, parentId: string | null, sortOrder: number) {
  return { id, parentId, sortOrder, title: `Doc ${id}` };
}

describe("buildDocumentTree", () => {
  it("builds a nested hierarchy from a flat list", () => {
    const tree = buildDocumentTree([
      doc("root-a", null, 0),
      doc("child-a1", "root-a", 0),
      doc("grandchild-a1x", "child-a1", 0),
      doc("root-b", null, 1),
    ]);

    expect(tree.map((node) => node.id)).toEqual(["root-a", "root-b"]);
    expect(tree[0]?.children.map((node) => node.id)).toEqual(["child-a1"]);
    expect(tree[0]?.children[0]?.children.map((node) => node.id)).toEqual([
      "grandchild-a1x",
    ]);
    expect(tree[1]?.children).toEqual([]);
  });

  it("sorts siblings by sortOrder at every depth", () => {
    const tree = buildDocumentTree([
      doc("root-b", null, 2),
      doc("root-a", null, 1),
      doc("child-2", "root-a", 5),
      doc("child-1", "root-a", 3),
    ]);

    expect(tree.map((node) => node.id)).toEqual(["root-a", "root-b"]);
    expect(tree[0]?.children.map((node) => node.id)).toEqual([
      "child-1",
      "child-2",
    ]);
  });

  it("falls back to root for a dangling parentId instead of dropping the node", () => {
    const tree = buildDocumentTree([
      doc("root-a", null, 0),
      doc("orphan", "missing-parent", 1),
      doc("orphan-child", "orphan", 0),
    ]);

    expect(tree.map((node) => node.id)).toEqual(["root-a", "orphan"]);
    expect(tree[1]?.children.map((node) => node.id)).toEqual(["orphan-child"]);
  });

  it("keeps original item fields on the nodes", () => {
    const tree = buildDocumentTree([doc("root-a", null, 0)]);

    expect(tree[0]?.title).toBe("Doc root-a");
  });
});

describe("flattenVisibleTree", () => {
  const tree = buildDocumentTree([
    doc("root-a", null, 0),
    doc("child-a1", "root-a", 0),
    doc("grandchild", "child-a1", 0),
    doc("root-b", null, 1),
  ]);

  it("only includes children of expanded nodes, in visual order", () => {
    const rows = flattenVisibleTree(tree, new Set(["root-a"]));

    expect(rows.map((row) => row.node.id)).toEqual([
      "root-a",
      "child-a1",
      "root-b",
    ]);
  });

  it("includes deeper levels when the whole ancestor chain is expanded", () => {
    const rows = flattenVisibleTree(tree, new Set(["root-a", "child-a1"]));

    expect(rows.map((row) => row.node.id)).toEqual([
      "root-a",
      "child-a1",
      "grandchild",
      "root-b",
    ]);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 0]);
    expect(rows[2]?.parentId).toBe("child-a1");
  });

  it("collapsed tree lists only roots", () => {
    const rows = flattenVisibleTree(tree, new Set());

    expect(rows.map((row) => row.node.id)).toEqual(["root-a", "root-b"]);
  });
});
