import { Editor, type JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { BlockMove } from "./block-move";
import { KaneoBoard } from "./kaneo-board";

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

  it("returns false and leaves content unchanged when not editable", () => {
    editor = createEditor(THREE_PARAGRAPHS);
    editor.commands.setTextSelection(1);
    editor.setEditable(false);

    expect(editor.commands.moveBlockDown()).toBe(false);
    expect(editor.commands.moveBlockUp()).toBe(false);
    expect(paragraphTexts(editor)).toEqual(["A", "B", "C"]);
  });
});
