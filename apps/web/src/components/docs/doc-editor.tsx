import type { Editor, JSONContent } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import {
  Bold,
  Braces,
  Code,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  type LucideIcon,
  Quote,
  Strikethrough,
  Table2,
  Underline as UnderlineIcon,
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ErrorDisplay } from "@/components/ui/error-display";
import { Skeleton } from "@/components/ui/skeleton";
import useUpdateDocument from "@/hooks/mutations/document/use-update-document";
import useDocument from "@/hooks/queries/document/use-document";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { debounceWithFlush } from "@/lib/debounce";
import { DocVersionHistory } from "./doc-version-history";
import { KaneoBoard } from "./extensions/kaneo-board";

const SAVE_DEBOUNCE_MS = 700;

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const lowlight = createLowlight(common);

type DocEditorProps = {
  documentId: string;
  /** Test/integration hook: receives the Tiptap editor once it exists. */
  onEditorReady?: (editor: Editor) => void;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

type PendingSave = {
  title?: string;
  content?: JSONContent;
};

type SlashRange = { from: number; to: number };

type SlashCommand = {
  id: string;
  label: string;
  group: "text" | "lists" | "insert";
  search: string;
  run: (editor: Editor, range: SlashRange) => void;
};

type SlashMenuState = {
  from: number;
  to: number;
  query: string;
  top: number;
  left: number;
  selectedIndex: number;
};

const SLASH_COMMANDS: Omit<SlashCommand, "label">[] = [
  {
    id: "paragraph",
    group: "text",
    search: "text paragraph normal",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    id: "heading-2",
    group: "text",
    search: "heading title h2",
    run: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 2 })
        .run();
    },
  },
  {
    id: "bullet-list",
    group: "lists",
    search: "list bullet unordered",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    id: "task-list",
    group: "lists",
    search: "todo to-do checklist checkbox task list",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    id: "ordered-list",
    group: "lists",
    search: "list ordered numbered",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    id: "blockquote",
    group: "insert",
    search: "quote blockquote",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    id: "code-block",
    group: "insert",
    search: "code snippet",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    id: "table",
    group: "insert",
    search: "table grid",
    run: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ cols: 3, rows: 3 })
        .run();
    },
  },
];

type BubbleAction = {
  id: string;
  icon: LucideIcon;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
};

// Mirrors SLASH_COMMANDS: data-driven toolbar buttons, grouped so a separator
// renders between block-level and inline-mark actions. The link button stays
// bespoke in the JSX because its click handler needs component state (setLink).
const BUBBLE_ACTION_GROUPS: BubbleAction[][] = [
  [
    {
      id: "heading-2",
      icon: Heading2,
      isActive: (editor) => editor.isActive("heading", { level: 2 }),
      run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      id: "bullet-list",
      icon: List,
      isActive: (editor) => editor.isActive("bulletList"),
      run: (editor) => editor.chain().focus().toggleBulletList().run(),
    },
    {
      id: "task-list",
      icon: ListTodo,
      isActive: (editor) => editor.isActive("taskList"),
      run: (editor) => editor.chain().focus().toggleTaskList().run(),
    },
    {
      id: "ordered-list",
      icon: ListOrdered,
      isActive: (editor) => editor.isActive("orderedList"),
      run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      id: "blockquote",
      icon: Quote,
      isActive: (editor) => editor.isActive("blockquote"),
      run: (editor) => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      id: "code-block",
      icon: Braces,
      isActive: (editor) => editor.isActive("codeBlock"),
      run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      id: "table",
      icon: Table2,
      isActive: () => false,
      run: (editor) =>
        editor.chain().focus().insertTable({ cols: 3, rows: 3 }).run(),
    },
  ],
  [
    {
      id: "bold",
      icon: Bold,
      isActive: (editor) => editor.isActive("bold"),
      run: (editor) => editor.chain().focus().toggleBold().run(),
    },
    {
      id: "italic",
      icon: Italic,
      isActive: (editor) => editor.isActive("italic"),
      run: (editor) => editor.chain().focus().toggleItalic().run(),
    },
    {
      id: "underline",
      icon: UnderlineIcon,
      isActive: (editor) => editor.isActive("underline"),
      run: (editor) => editor.chain().focus().toggleUnderline().run(),
    },
    {
      id: "strike",
      icon: Strikethrough,
      isActive: (editor) => editor.isActive("strike"),
      run: (editor) => editor.chain().focus().toggleStrike().run(),
    },
    {
      id: "code",
      icon: Code,
      isActive: (editor) => editor.isActive("code"),
      run: (editor) => editor.chain().focus().toggleCode().run(),
    },
  ],
];

export function DocEditor({ documentId, onEditorReady }: DocEditorProps) {
  const { t } = useTranslation();
  const {
    data: document,
    isLoading,
    isError,
    error,
    refetch,
  } = useDocument({ id: documentId });
  const { mutateAsync: updateDocument } = useUpdateDocument();
  const { canUpdateDocuments } = useWorkspacePermission();
  const canEdit = canUpdateDocuments();

  const [title, setTitle] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  // The editor only accepts commands once its view is mounted (onCreate).
  const [isEditorReady, setIsEditorReady] = useState(false);

  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const updateDocumentRef = useRef(updateDocument);
  const pendingRef = useRef<PendingSave>({});
  const saveSeqRef = useRef(0);
  const hydratedDocumentIdRef = useRef<string | null>(null);
  const hydratedEditorRef = useRef<Editor | null>(null);
  const lastSyncedUpdatedAtRef = useRef<string | null>(null);
  const isTitleFocusedRef = useRef(false);
  const slashMenuRef = useRef<SlashMenuState | null>(null);

  useEffect(() => {
    updateDocumentRef.current = updateDocument;
  }, [updateDocument]);

  const hasPendingEdits = useCallback(
    () =>
      pendingRef.current.title !== undefined ||
      pendingRef.current.content !== undefined,
    [],
  );

  const performSave = useCallback(async () => {
    if (!hasPendingEdits()) return;
    const payload = pendingRef.current;
    pendingRef.current = {};
    const seq = ++saveSeqRef.current;

    try {
      await updateDocumentRef.current({ id: documentId, ...payload });
      if (seq === saveSeqRef.current && !hasPendingEdits()) {
        setSaveStatus("saved");
      }
    } catch (saveError) {
      console.error("Failed to save document:", saveError);
      // Retain the failed fields client-side (newer local edits win) so the
      // next edit retries them instead of silently dropping content.
      pendingRef.current = { ...payload, ...pendingRef.current };
      if (seq === saveSeqRef.current) {
        setSaveStatus("error");
      }
    }
  }, [documentId, hasPendingEdits]);

  const performSaveRef = useRef(performSave);
  useEffect(() => {
    performSaveRef.current = performSave;
  }, [performSave]);

  const debouncedSave = useMemo(
    () =>
      debounceWithFlush(() => {
        void performSaveRef.current();
      }, SAVE_DEBOUNCE_MS),
    [],
  );

  const queueSave = useCallback(
    (patch: PendingSave) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      setSaveStatus("saving");
      debouncedSave();
    },
    [debouncedSave],
  );

  // Flush trailing edits when the user navigates away or closes the tab.
  // Keyed on documentId so switching docs flushes while performSaveRef still
  // holds the closure over the OLD id — a pending edit must never be saved
  // under the next document's id.
  // biome-ignore lint/correctness/useExhaustiveDependencies: documentId is intentional — re-running the effect on doc switch flushes pending edits while the save closure still holds the old id
  useEffect(() => {
    const flush = () => debouncedSave.flush();
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [debouncedSave, documentId]);

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: canEdit,
      extensions: [
        StarterKit.configure({
          codeBlock: false,
          link: false,
          trailingNode: false,
          heading: { levels: [1, 2, 3] },
        }),
        // Default protocol validation is the sanitizer for stored content:
        // disallowed schemes such as javascript: never become clickable hrefs.
        Link.configure({
          autolink: true,
          defaultProtocol: "https",
          linkOnPaste: true,
          openOnClick: false,
        }),
        CodeBlockLowlight.configure({
          lowlight,
          HTMLAttributes: { class: "kaneo-tiptap-codeblock" },
        }),
        Placeholder.configure({
          placeholder: t("documents:editor.placeholder"),
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        KaneoBoard,
      ],
      editorProps: {
        attributes: {
          class: "kaneo-tiptap-prose",
          "aria-label": t("documents:editor.contentLabel"),
        },
      },
      onCreate: ({ editor: createdEditor }) => {
        setIsEditorReady(true);
        onEditorReady?.(createdEditor);
      },
      onUpdate: ({ editor: activeEditor }) => {
        queueSave({ content: activeEditor.getJSON() });
      },
    },
    [t],
  );

  useEffect(() => {
    if (!editor || !isEditorReady) return;
    editor.setEditable(canEdit);
  }, [editor, isEditorReady, canEdit]);

  // Hydrate the editor from the stored ProseMirror JSON once per document,
  // then re-sync external changes (e.g. a version restore) only while the
  // user isn't mid-edit.
  useEffect(() => {
    if (!editor || !isEditorReady || !document) return;

    const storedContent = (document.content as JSONContent | null) ?? EMPTY_DOC;

    if (
      hydratedDocumentIdRef.current !== documentId ||
      hydratedEditorRef.current !== editor
    ) {
      hydratedDocumentIdRef.current = documentId;
      hydratedEditorRef.current = editor;
      lastSyncedUpdatedAtRef.current = document.updatedAt;
      pendingRef.current = {};
      setSaveStatus("idle");
      setTitle(document.title);
      editor.commands.setContent(storedContent, { emitUpdate: false });
      return;
    }

    if (document.updatedAt === lastSyncedUpdatedAtRef.current) return;
    lastSyncedUpdatedAtRef.current = document.updatedAt;
    if (editor.isFocused || hasPendingEdits()) return;

    if (JSON.stringify(storedContent) !== JSON.stringify(editor.getJSON())) {
      editor.commands.setContent(storedContent, { emitUpdate: false });
    }
    if (!isTitleFocusedRef.current) {
      setTitle(document.title);
    }
  }, [editor, isEditorReady, document, documentId, hasPendingEdits]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(
      t("tasks:detail.editor.enterUrl"),
      previousUrl || "",
    );
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor, t]);

  const slashCommands = useMemo<SlashCommand[]>(
    () =>
      SLASH_COMMANDS.map((command) => ({
        ...command,
        label: t(`tasks:detail.editor.slash.commands.${command.id}`),
      })),
    [t],
  );

  const filteredSlashCommands = useMemo(() => {
    const query = slashMenu?.query.trim().toLowerCase() || "";
    if (!query) return slashCommands;
    return slashCommands.filter(
      (command) =>
        command.label.toLowerCase().includes(query) ||
        command.search.includes(query),
    );
  }, [slashCommands, slashMenu?.query]);

  const filteredSlashCommandsRef = useRef(filteredSlashCommands);
  useEffect(() => {
    filteredSlashCommandsRef.current = filteredSlashCommands;
  }, [filteredSlashCommands]);
  useEffect(() => {
    slashMenuRef.current = slashMenu;
  }, [slashMenu]);

  const groupedSlashCommands = useMemo(
    () =>
      (["text", "lists", "insert"] as const).map((group) => ({
        group,
        title: t(`tasks:detail.editor.slash.groups.${group}`),
        items: filteredSlashCommands.filter(
          (command) => command.group === group,
        ),
      })),
    [filteredSlashCommands, t],
  );

  const runSlashCommand = useCallback(
    (command: SlashCommand) => {
      const current = slashMenuRef.current;
      if (!editor || !current) return;
      command.run(editor, { from: current.from, to: current.to });
      setSlashMenu(null);
    },
    [editor],
  );

  const syncSlashMenu = useCallback((activeEditor: Editor) => {
    const { state, view } = activeEditor;
    if (!state.selection.empty) {
      setSlashMenu(null);
      return;
    }

    const { $from } = state.selection;
    if ($from.parent.type.name === "codeBlock") {
      setSlashMenu(null);
      return;
    }

    const textBeforeCursor = state.doc.textBetween(
      $from.start(),
      $from.pos,
      "\n",
      "\0",
    );
    const match = /(?:^|\s)\/([^\s/]*)$/.exec(textBeforeCursor);
    if (!match) {
      setSlashMenu(null);
      return;
    }

    const query = match[1] || "";
    const from = $from.pos - query.length - 1;
    const to = $from.pos;
    const coords = view.coordsAtPos($from.pos);
    const shellRect = editorShellRef.current?.getBoundingClientRect();
    const top = shellRect ? coords.bottom - shellRect.top + 6 : coords.bottom;
    const left = shellRect ? coords.left - shellRect.left : coords.left;

    setSlashMenu((current) => {
      const isSameQuery =
        current?.from === from &&
        current?.to === to &&
        current?.query === query;
      return {
        from,
        to,
        query,
        top,
        left,
        selectedIndex: isSameQuery ? current.selectedIndex : 0,
      };
    });
  }, []);

  useEffect(() => {
    if (!editor || !canEdit) return;

    const onChange = () => syncSlashMenu(editor);
    editor.on("selectionUpdate", onChange);
    editor.on("update", onChange);
    return () => {
      editor.off("selectionUpdate", onChange);
      editor.off("update", onChange);
    };
  }, [editor, canEdit, syncSlashMenu]);

  useEffect(() => {
    if (!canEdit) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const current = slashMenuRef.current;
      if (!editor || !current || !editor.isFocused) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setSlashMenu(null);
        return;
      }

      const commands = filteredSlashCommandsRef.current;
      if (!commands.length) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setSlashMenu((value) =>
          value
            ? {
                ...value,
                selectedIndex:
                  (value.selectedIndex + delta + commands.length) %
                  commands.length,
              }
            : value,
        );
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const command = commands[current.selectedIndex] || commands[0];
        if (command) runSlashCommand(command);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [canEdit, editor, runSlashCommand]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-8">
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (isError) {
    return <ErrorDisplay error={error} onRetry={() => void refetch()} />;
  }

  if (!document) return null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 p-8">
      <div className="flex items-baseline gap-3">
        {canEdit ? (
          <input
            aria-label={t("documents:editor.titleLabel")}
            className="min-w-0 flex-1 border-0 bg-transparent font-heading font-semibold text-3xl text-foreground outline-none placeholder:text-muted-foreground/50"
            onBlur={() => {
              isTitleFocusedRef.current = false;
            }}
            onChange={(event) => {
              setTitle(event.target.value);
              queueSave({ title: event.target.value });
            }}
            onFocus={() => {
              isTitleFocusedRef.current = true;
            }}
            placeholder={t("documents:editor.titlePlaceholder")}
            type="text"
            value={title}
          />
        ) : (
          <h1 className="min-w-0 flex-1 font-heading font-semibold text-3xl text-foreground">
            {document.title || t("documents:editor.titlePlaceholder")}
          </h1>
        )}
        {canEdit && saveStatus !== "idle" && (
          <span
            className={cn(
              "shrink-0 text-muted-foreground text-xs",
              saveStatus === "error" && "text-destructive",
            )}
            role="status"
          >
            {saveStatus === "saving" && t("documents:editor.save.saving")}
            {saveStatus === "saved" && t("documents:editor.save.saved")}
            {saveStatus === "error" && t("documents:editor.save.error")}
          </span>
        )}
        <DocVersionHistory
          documentId={documentId}
          workspaceId={document.workspaceId}
        />
      </div>

      <section
        aria-label={t("documents:editor.ariaLabel")}
        className="kaneo-tiptap-shell group"
        ref={editorShellRef}
      >
        {editor && canEdit && (
          <BubbleMenu
            className="kaneo-tiptap-bubble"
            editor={editor}
            shouldShow={({ editor: activeEditor, from, to }) => {
              if (activeEditor.isEmpty) return false;
              return from !== to;
            }}
          >
            {BUBBLE_ACTION_GROUPS.map((group, groupIndex) => (
              <Fragment key={group[0]?.id}>
                {groupIndex > 0 && (
                  <span className="kaneo-tiptap-bubble-separator" />
                )}
                {group.map((action) => (
                  <Button
                    className={cn(
                      "kaneo-tiptap-bubble-btn",
                      action.isActive(editor) &&
                        "bg-accent text-accent-foreground",
                    )}
                    key={action.id}
                    onClick={() => action.run(editor)}
                    size="xs"
                    type="button"
                    variant="ghost"
                  >
                    <action.icon className="size-3.5" />
                  </Button>
                ))}
              </Fragment>
            ))}
            <Button
              className={cn(
                "kaneo-tiptap-bubble-btn",
                editor.isActive("link") && "bg-accent text-accent-foreground",
              )}
              onClick={setLink}
              size="xs"
              type="button"
              variant="ghost"
            >
              <Link2 className="size-3.5" />
            </Button>
          </BubbleMenu>
        )}

        {editor && canEdit && slashMenu && (
          <div
            className="kaneo-tiptap-slash-menu"
            style={{
              top: slashMenu.top,
              left: slashMenu.left,
              position: "absolute",
            }}
          >
            {filteredSlashCommands.length > 0 ? (
              groupedSlashCommands.map((group) => {
                if (!group.items.length) return null;
                return (
                  <div className="kaneo-tiptap-slash-group" key={group.group}>
                    <div className="kaneo-tiptap-slash-group-title">
                      {group.title}
                    </div>
                    {group.items.map((command) => {
                      const index = filteredSlashCommands.findIndex(
                        (candidate) => candidate.id === command.id,
                      );
                      return (
                        <button
                          className={cn(
                            "kaneo-tiptap-slash-item",
                            slashMenu.selectedIndex === index && "is-selected",
                          )}
                          key={command.id}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            runSlashCommand(command);
                          }}
                          onMouseEnter={() =>
                            setSlashMenu((current) =>
                              current
                                ? { ...current, selectedIndex: index }
                                : current,
                            )
                          }
                          type="button"
                        >
                          <span className="kaneo-tiptap-slash-label">
                            {command.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            ) : (
              <div className="kaneo-tiptap-slash-empty">
                {t("tasks:detail.editor.slash.empty")}
              </div>
            )}
          </div>
        )}

        <EditorContent className="kaneo-tiptap-content" editor={editor} />
      </section>
    </div>
  );
}
