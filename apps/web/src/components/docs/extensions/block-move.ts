import { type CommandProps, Extension } from "@tiptap/core";
import { AllSelection, NodeSelection, TextSelection } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockMove: {
      /** Move the current top-level block one sibling up. */
      moveBlockUp: () => ReturnType;
      /** Move the current top-level block one sibling down. */
      moveBlockDown: () => ReturnType;
    };
  }
}

/**
 * Moves the top-level block containing the selection one sibling up or down.
 *
 * Document-level semantics: the moved unit is always the depth-1 ancestor, so
 * a cursor inside a nested list item moves the whole top-level list. At the
 * document edges (first block up, last block down) the command returns true
 * without dispatching — the keystroke is swallowed consistently instead of
 * falling through to the browser's default Alt+Arrow behavior mid-editing.
 */
function moveBlock(direction: -1 | 1) {
  return ({ editor, state, tr, dispatch }: CommandProps): boolean => {
    if (!editor.isEditable) return false;

    const { selection } = state;
    const { doc } = state;

    // Resolve the top-level block's boundaries. A NodeSelection of a
    // top-level block resolves at depth 0; text selections use the depth-1
    // ancestor. Anything else (e.g. an all-selection) is not a block move.
    let blockStart: number;
    const isTopLevelNodeSelection =
      selection instanceof NodeSelection && selection.$from.depth === 0;
    if (isTopLevelNodeSelection) {
      blockStart = selection.from;
    } else if (selection.$from.depth >= 1) {
      blockStart = selection.$from.before(1);
    } else if (
      selection.$from.depth === 0 &&
      !(selection instanceof AllSelection) &&
      selection.$from.nodeAfter
    ) {
      // NodeRangeSelection restored by the drag-handle plugin after drop: a
      // depth-0 range spanning whole top-level blocks. Move its first block
      // so Alt+Arrow keeps working right after a drag.
      blockStart = selection.from;
    } else {
      return false;
    }

    const index = doc.resolve(blockStart).index(0);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= doc.childCount) {
      // Edge no-op: handled, nothing to move.
      return true;
    }
    if (!dispatch) return true;

    const block = doc.child(index);
    const blockEnd = blockStart + block.nodeSize;
    const sibling = doc.child(targetIndex);
    // Caret offset within the moved block, captured pre-delete; the block
    // node is reinserted unchanged, so the offset stays valid at insertPos.
    const selectionOffset = selection.from - blockStart;

    tr.delete(blockStart, blockEnd);
    // After deleting the block, positions before blockStart are unchanged and
    // the following sibling now starts at blockStart, so both boundaries are
    // one sibling-size away from blockStart.
    const insertPos =
      direction === -1
        ? blockStart - sibling.nodeSize
        : blockStart + sibling.nodeSize;
    tr.insert(insertPos, block);

    // Restore selection inside the moved block: keep atoms node-selected,
    // put the cursor back at its original in-block offset for text blocks.
    if (isTopLevelNodeSelection) {
      tr.setSelection(NodeSelection.create(tr.doc, insertPos));
    } else {
      tr.setSelection(
        TextSelection.near(tr.doc.resolve(insertPos + selectionOffset)),
      );
    }
    tr.scrollIntoView();
    return true;
  };
}

export const BlockMove = Extension.create({
  name: "blockMove",

  addCommands() {
    return {
      moveBlockUp: () => moveBlock(-1),
      moveBlockDown: () => moveBlock(1),
    };
  },

  addKeyboardShortcuts() {
    return {
      "Alt-ArrowUp": () => this.editor.commands.moveBlockUp(),
      "Alt-ArrowDown": () => this.editor.commands.moveBlockDown(),
    };
  },
});
