import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { DocBoardEmbed } from "../doc-board-embed";

export const KaneoBoard = Node.create({
  name: "kaneoBoard",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      projectId: {},
      view: { default: "board" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-kaneo-board]",
        getAttrs: (element) => ({
          projectId: element.getAttribute("data-project-id") || "",
          view: element.getAttribute("data-view") || "board",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const projectId = String(node.attrs.projectId || "");
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-kaneo-board": "",
        "data-project-id": projectId,
        "data-view": String(node.attrs.view || "board"),
      }),
      [
        "a",
        { href: projectId ? `/dashboard/project/${projectId}` : "#" },
        `[Board: ${projectId}]`,
      ],
    ];
  },

  renderText({ node }) {
    return `[Board: ${String(node.attrs.projectId || "")}]`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(DocBoardEmbed);
  },
});
