import { Editor, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Selection } from "@tiptap/pm/state";
import type { Mappable } from "@tiptap/pm/transform";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { BlockMove } from "./block-move";
import { KaneoBoard } from "./kaneo-board";

/**
 * Stand-in for the drag-handle plugin's NodeRangeSelection
 * (@tiptap/extension-node-range is a transitive dependency pnpm does not
 * expose for direct import here): a non-Node, non-All selection whose $from
 * resolves at depth 0 in front of a top-level block — the selection shape
 * the plugin restores after a drop.
 */
class FakeNodeRangeSelection extends Selection {
  eq(other: Selection): boolean {
    return (
      other instanceof FakeNodeRangeSelection &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  map(doc: ProseMirrorNode, mapping: Mappable): Selection {
    return new FakeNodeRangeSelection(
      doc.resolve(mapping.map(this.from)),
      doc.resolve(mapping.map(this.to)),
    );
  }

  toJSON(): { type: string; from: number; to: number } {
    return { type: "fakeNodeRange", from: this.from, to: this.to };
  }
}

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function createEditor(content: JSONContent) {
  return new Editor({
    extensions: [StarterKit.configure({ link: false }), KaneoBoard, BlockMove],
    content,
  });
}

function blockTypes(editor: Editor): (string | undefined)[] {
  return editor.getJSON().content?.map((node) => node.type) ?? [];
}

function paragraphTexts(editor: Editor): (string | undefined)[] {
  return editor.getJSON().content?.map((node) => node.content?.[0]?.text) ?? [];
}

const THREE_PARAGRAPHS: JSONContent = {
  type: "doc",
  content: [paragraph("A"), paragraph("B"), paragraph("C")],
};

describe("BlockMove extension", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("moves the first paragraph down, then back up", () => {
    editor = createEditor(THREE_PARAGRAPHS);
    // Cursor inside paragraph "A".
    editor.commands.setTextSelection(1);

    expect(editor.commands.moveBlockDown()).toBe(true);
    expect(paragraphTexts(editor)).toEqual(["B", "A", "C"]);

    // Selection follows the moved block, so ArrowUp reverses the move.
    expect(editor.commands.moveBlockUp()).toBe(true);
    expect(paragraphTexts(editor)).toEqual(["A", "B", "C"]);
  });

  it("keeps the caret at its in-block offset after a move", () => {
    editor = createEditor({
      type: "doc",
      content: [paragraph("Alpha"), paragraph("Beta")],
    });
    // "Alpha" occupies 0..7; caret between "Al" and "pha" (pos 3, offset 3
    // from the block start).
    editor.commands.setTextSelection(3);

    expect(editor.commands.moveBlockDown()).toBe(true);
    expect(paragraphTexts(editor)).toEqual(["Beta", "Alpha"]);

    const { $from } = editor.state.selection;
    expect($from.parent.textContent).toBe("Alpha");
    // "Beta" occupies 0..6, so moved "Alpha" starts at 6; the caret keeps
    // its offset 3 within the block → absolute pos 9.
    expect(editor.state.selection.from).toBe(9);
    expect($from.parentOffset).toBe(2);
  });

  it("no-ops at the document edges without throwing", () => {
    editor = createEditor(THREE_PARAGRAPHS);

    editor.commands.setTextSelection(1);
    expect(editor.commands.moveBlockUp()).toBe(true);
    expect(paragraphTexts(editor)).toEqual(["A", "B", "C"]);

    // Cursor inside the last paragraph "C".
    editor.commands.setTextSelection(editor.state.doc.content.size - 2);
    expect(editor.commands.moveBlockDown()).toBe(true);
    expect(paragraphTexts(editor)).toEqual(["A", "B", "C"]);
  });

  it("moves a node-selected kaneoBoard atom as a unit and keeps it selected", () => {
    editor = createEditor({
      type: "doc",
      content: [
        paragraph("A"),
        { type: "kaneoBoard", attrs: { projectId: "proj-1", view: "board" } },
        paragraph("C"),
      ],
    });
    // Paragraph "A" occupies positions 0..3; the board starts at 3.
    editor.commands.setNodeSelection(3);

    expect(editor.commands.moveBlockUp()).toBe(true);
    expect(blockTypes(editor)).toEqual([
      "kaneoBoard",
      "paragraph",
      "paragraph",
    ]);

    const { selection } = editor.state;
    expect(selection).toBeInstanceOf(NodeSelection);
    expect((selection as NodeSelection).node.type.name).toBe("kaneoBoard");
  });

  it("moves the whole top-level list when the cursor is inside a list item", () => {
    editor = createEditor({
      type: "doc",
      content: [
        paragraph("A"),
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [paragraph("item one")] },
            { type: "listItem", content: [paragraph("item two")] },
          ],
        },
        paragraph("C"),
      ],
    });
    // Position 6 is inside the first list item's paragraph text.
    editor.commands.setTextSelection(6);

    expect(editor.commands.moveBlockUp()).toBe(true);
    expect(blockTypes(editor)).toEqual([
      "bulletList",
      "paragraph",
      "paragraph",
    ]);
    // The list moved intact, list items untouched.
    const list = editor.getJSON().content?.[0];
    expect(list?.content).toHaveLength(2);
  });

  it("moves the first spanned block for a depth-0 range selection (post-drag NodeRangeSelection)", () => {
    editor = createEditor(THREE_PARAGRAPHS);
    const { doc } = editor.state;
    // Range covering the whole first block, resolved at depth 0 — like the
    // NodeRangeSelection the drag-handle plugin restores after a drop.
    const rangeSelection = new FakeNodeRangeSelection(
      doc.resolve(0),
      doc.resolve(doc.child(0).nodeSize),
    );
    editor.commands.command(({ tr, dispatch }) => {
      if (dispatch) dispatch(tr.setSelection(rangeSelection));
      return true;
    });
    expect(editor.state.selection.$from.depth).toBe(0);

    expect(editor.commands.moveBlockDown()).toBe(true);
    expect(paragraphTexts(editor)).toEqual(["B", "A", "C"]);
  });

  it("moves the block on a real Alt+ArrowDown keydown through the editor view", () => {
    // The keymap only fires through a mounted view, so attach one to jsdom.
    const host = document.createElement("div");
    document.body.appendChild(host);
    try {
      editor = new Editor({
        element: host,
        extensions: [
          StarterKit.configure({ link: false }),
          KaneoBoard,
          BlockMove,
        ],
        content: THREE_PARAGRAPHS,
      });
      editor.commands.setTextSelection(1);

      const handled = editor.view.dom.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          altKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );

      // The keymap consumed the event (preventDefault) and moved the block.
      expect(handled).toBe(false);
      expect(paragraphTexts(editor)).toEqual(["B", "A", "C"]);
    } finally {
      host.remove();
    }
  });

  it("returns false and leaves content unchanged when not editable", () => {
    editor = createEditor(THREE_PARAGRAPHS);
    editor.commands.setTextSelection(1);
    editor.setEditable(false);

    expect(editor.commands.moveBlockDown()).toBe(false);
    expect(editor.commands.moveBlockUp()).toBe(false);
    expect(paragraphTexts(editor)).toEqual(["A", "B", "C"]);
  });
});
