import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { GripVertical } from "lucide-react";

export function DocBoardEmbed({ node }: NodeViewProps) {
  const projectId = String(node.attrs.projectId || "");

  return (
    <NodeViewWrapper
      className="kaneo-doc-board-embed"
      data-testid="doc-board-embed"
    >
      <div className="flex items-center gap-1.5 border-border border-b px-2 py-1.5">
        <span
          className="cursor-grab text-muted-foreground"
          contentEditable={false}
          data-drag-handle
        >
          <GripVertical className="size-4" />
        </span>
      </div>
      <div className="px-3 py-2 text-muted-foreground text-sm">{projectId}</div>
    </NodeViewWrapper>
  );
}
