import { EditorApp } from "monaco-languageclient/editorApp";
import { KeyCode, KeyMod, Uri } from "@codingame/monaco-vscode-editor-api";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import type { PanelProps } from "../../types";
import type { CodeEditorState } from "./index";
import { startMonaco } from "./monaco";

type Status =
  | { readonly kind: "loading" }
  | { readonly kind: "ready" }
  | { readonly kind: "missing" }
  | { readonly kind: "error"; readonly message: string };

const errorMessage = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/** The model URI is the file's path on the server's machine, as a language server will expect. */
function fileUri(workspaceRoot: string, path: string): string {
  const separator = workspaceRoot.includes("\\") && !workspaceRoot.includes("/") ? "\\" : "/";
  return Uri.file(`${workspaceRoot.replace(/[\\/]+$/, "")}${separator}${path}`).toString();
}

export default function CodeEditorPanel({
  state,
  host,
  workspaceRoot,
  appearance,
}: PanelProps<CodeEditorState>) {
  const [draftPath, setDraftPath] = useState(state.path ?? "");
  const path = state.path;
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<EditorApp | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  // The text last read or saved, which the editor's contents are compared against.
  const savedTextRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useEffectEvent(() => {
    const text = appRef.current?.getTextModels().modified?.getValue();
    if (path === null || text === undefined || saving) return;
    setSaving(true);
    setSaveError(null);
    host
      .writeFile(path, text)
      .then(() => {
        savedTextRef.current = text;
        setDirty(appRef.current?.getTextModels().modified?.getValue() !== text);
      })
      .catch((cause: unknown) => setSaveError(errorMessage(cause)))
      .then(() => setSaving(false));
  });

  const open = useEffectEvent((container: HTMLDivElement, filePath: string, root: string) => {
    let cancelled = false;
    let app: EditorApp | null = null;
    void (async () => {
      try {
        const [file] = await Promise.all([host.readFile(filePath), startMonaco(appearance)]);
        if (cancelled) return;
        if (file === null) {
          setStatus({ kind: "missing" });
          return;
        }
        app = new EditorApp({
          codeResources: { modified: { text: file.contents, uri: fileUri(root, filePath) } },
          readOnly: file.truncated,
          editorOptions: { readOnly: file.truncated },
        });
        await app.start(container);
        if (cancelled) return;
        appRef.current = app;
        savedTextRef.current = file.contents;
        setDirty(false);
        app.registerOnTextChangedCallback(({ modified }) => {
          setDirty(modified !== undefined && modified !== savedTextRef.current);
        });
        // Cmd/Ctrl+S saves while the editor has focus.
        const editor = app.getEditor();
        editor?.addAction({
          id: "t3code.save",
          label: "Save",
          keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
          run: () => save(),
        });
        setStatus(
          file.truncated
            ? { kind: "error", message: "File too large to edit; showing its start read-only." }
            : { kind: "ready" },
        );
      } catch (cause) {
        if (!cancelled) setStatus({ kind: "error", message: errorMessage(cause) });
      }
    })();
    return () => {
      cancelled = true;
      appRef.current = null;
      void app?.dispose();
    };
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- mounts a Monaco editor, an external widget, for the chosen file and disposes it when the file or workspace changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container || path === null || !workspaceRoot) return;
    return open(container, path, workspaceRoot);
  }, [path, workspaceRoot]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- follows the app's light or dark theme in Monaco's own theme service
  useEffect(() => {
    if (appRef.current) void startMonaco(appearance);
  }, [appearance]);

  if (!workspaceRoot) {
    return <div className="p-3 text-muted-foreground text-sm">This thread has no workspace.</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        className="flex items-center gap-2 border-b px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = draftPath.trim();
          if (next.length === 0 || next === path) return;
          if (dirty && !window.confirm("Discard unsaved changes?")) return;
          setStatus({ kind: "loading" });
          host.setState({ path: next });
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 py-1 font-mono text-xs outline-none focus-visible:border-ring"
          placeholder="src/index.ts"
          value={draftPath}
          onChange={(event) => setDraftPath(event.target.value)}
        />
        <Button size="compact" variant="ghost" type="submit">
          Open
        </Button>
        <Button
          size="compact"
          type="button"
          disabled={!dirty || saving || status.kind !== "ready"}
          onClick={() => save()}
        >
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </Button>
      </form>
      {saveError ? (
        <div className="border-b px-3 py-1.5 text-destructive-foreground text-xs">{saveError}</div>
      ) : null}
      {path === null ? (
        <div className="p-3 text-muted-foreground text-sm">
          Enter a workspace-relative path to open it.
        </div>
      ) : status.kind === "missing" ? (
        <div className="p-3 text-muted-foreground text-sm">{path} does not exist.</div>
      ) : status.kind === "error" ? (
        <div className="px-3 py-1.5 text-muted-foreground text-xs">{status.message}</div>
      ) : status.kind === "loading" ? (
        <div className="px-3 py-1.5 text-muted-foreground text-xs">Loading editor…</div>
      ) : null}
      {/* Monaco owns this element's children; React never renders into it. */}
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  );
}
