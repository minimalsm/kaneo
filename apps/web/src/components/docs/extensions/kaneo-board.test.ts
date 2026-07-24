import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { KaneoBoard } from "./kaneo-board";

function createEditor(content?: JSONContent) {
  return new Editor({
    extensions: [StarterKit.configure({ link: false }), KaneoBoard],
    content,
  });
}

describe("KaneoBoard extension", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("round-trips the node with exact attrs through getJSON/setContent", () => {
    editor = createEditor();
    editor.commands.insertContent({
      type: "kaneoBoard",
      attrs: { projectId: "proj-123", view: "list" },
    });

    const json = editor.getJSON();
    const boardNode = json.content?.find((node) => node.type === "kaneoBoard");
    expect(boardNode).toBeDefined();
    expect(boardNode?.attrs).toEqual({ projectId: "proj-123", view: "list" });

    editor.commands.setContent(json);
    const restored = editor
      .getJSON()
      .content?.find((node) => node.type === "kaneoBoard");
    expect(restored?.attrs).toEqual({ projectId: "proj-123", view: "list" });
  });

  it("includes the renderText output in getText()", () => {
    editor = createEditor({
      type: "doc",
      content: [
        {
          type: "kaneoBoard",
          attrs: { projectId: "proj-123", view: "board" },
        },
      ],
    });

    expect(editor.getText()).toContain("[Board: proj-123]");
  });

  it("defaults the view attr to 'board' when missing", () => {
    editor = createEditor({
      type: "doc",
      content: [
        {
          type: "kaneoBoard",
          attrs: { projectId: "proj-456" },
        },
      ],
    });

    const boardNode = editor
      .getJSON()
      .content?.find((node) => node.type === "kaneoBoard");
    expect(boardNode?.attrs).toEqual({ projectId: "proj-456", view: "board" });
  });
});
