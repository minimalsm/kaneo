import { MAX_CONTENT_DEPTH } from "./constants";

// Derives a plaintext representation of a ProseMirror JSON document by
// collecting text nodes with an iterative explicit-stack walk. Nodes nested
// deeper than MAX_CONTENT_DEPTH are skipped rather than descended into, so a
// maliciously deep payload can never blow the call stack.
export function deriveContentText(content: unknown): string {
  const parts: string[] = [];
  const stack: Array<{ node: unknown; depth: number }> = [
    { node: content, depth: 0 },
  ];

  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) {
      break;
    }
    const { node, depth } = entry;

    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        stack.push({ node: node[i], depth });
      }
      continue;
    }

    if (!node || typeof node !== "object") {
      continue;
    }

    const record = node as Record<string, unknown>;

    if (typeof record.text === "string" && record.text.length > 0) {
      parts.push(record.text);
    }

    if (record.content !== undefined && depth < MAX_CONTENT_DEPTH) {
      stack.push({ node: record.content, depth: depth + 1 });
    }
  }

  return parts.join(" ").trim();
}
