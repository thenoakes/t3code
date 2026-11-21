import { EditorApp } from "monaco-languageclient/editorApp";
import { KeyCode, KeyMod, Uri } from "@codingame/monaco-vscode-editor-api";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import type { PanelProps } from "../../types";
import type { CodeEditorState } from "./index";
import { acquireWorkspaceLanguageClient, type LanguageClientStatus } from "./languageClient";
import { startMonaco } from "./monaco";
import { nextUnsavedState, restoreUnsaved } from "./unsaved";

type Status =
  | { readonly kind: "loading" }
  | { readonly kind: "ready" }
  | { readonly kind: "missing" }
  | { readonly kind: "error"; readonly message: string };

/** The file changed on disk while the editor held edits, so neither copy wins silently. */
type Conflict =
  | { readonly kind: "changed"; readonly diskText: string }
  | { readonly kind: "deleted" };

// Edits are written to the tab's state once typing pauses, not on every keystroke.
const KEEP_UNSAVED_DELAY_MS = 400;

const errorMessage = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/** The model URI is the file's path on the server's machine, as a language server will expect. */
function fileUri(workspaceRoot: string, path: string): string {
  const separator = workspaceRoot.includes("\\") && !workspaceRoot.includes("/") ? "\\" : "/";
  return Uri.file(`${workspaceRoot.replace(/[\\/]+$/, "")}${separator}${path}`).toString();
}

// Files the TypeScript language server answers for.
const TYPESCRIPT_FILE = /\.(?:[cm]?ts|tsx)$/i;

export default function CodeEditorPanel({
  state,
  host,
  environmentId,
  workspaceRoot,
  workspaceRevision,
  visible,
  appearance,
}: PanelProps<CodeEditorState>) {
  const [draftPath, setDraftPath] = useState(state.path ?? "");
  const path = state.path;
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<EditorApp | null>(null);
  // The text last read or saved, which the editor's contents are compared against.
  const savedTextRef = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [languageStatus, setLanguageStatus] = useState<LanguageClientStatus | null>(null);
  const keepUnsavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editorText = () => appRef.current?.getTextModels().modified?.getValue();

  /** Writes the editor's unsaved edits to the tab's state, or clears them once there are none. */
  const keepUnsaved = useEffectEvent((filePath: string) => {
    if (keepUnsavedTimerRef.current !== null) clearTimeout(keepUnsavedTimerRef.current);
    keepUnsavedTimerRef.current = null;
    const text = editorText();
    const saved = savedTextRef.current;
    if (text === undefined || saved === null) return;
    const next = nextUnsavedState(state, filePath, text, saved);
    if (next !== null) host.setState(next);
  });

  /** Replaces the editor's text with the file's, as one undoable edit. */
  const applyDiskText = (text: string) => {
    const editor = appRef.current?.getEditor();
    const model = editor?.getModel();
    savedTextRef.current = text;
    setConflict(null);
    setDirty(false);
    if (!editor || !model || model.getValue() === text) return;
    editor.pushUndoStop();
    editor.executeEdits("t3code.disk", [{ range: model.getFullModelRange(), text }]);
    editor.pushUndoStop();
    if (path !== null) keepUnsaved(path);
  };

  /** Reads the file again and takes the disk's copy, unless that would drop unsaved edits. */
  const syncWithDisk = useEffectEvent((_revision: string | null) => {
    if (path === null || appRef.current === null || saving) return;
    host
      .readFile(path)
      .then((file) => {
        const current = editorText();
        if (current === undefined) return;
        if (file === null) {
          setConflict({ kind: "deleted" });
        } else if (file.contents === savedTextRef.current) {
          // Unchanged since the last read or save.
        } else if (current === savedTextRef.current || current === file.contents) {
          // No unsaved edits, or the same ones the disk now holds: take the disk's copy.
          applyDiskText(file.contents);
        } else {
          setConflict({ kind: "changed", diskText: file.contents });
        }
      })
      // A failed check leaves the editor as it is; the next change or save checks again.
      .catch(() => undefined);
  });

  const save = useEffectEvent(() => {
    const text = editorText();
    if (path === null || text === undefined || saving) return;
    setSaving(true);
    setSaveError(null);
    host
      .readFile(path)
      .then((file) => {
        // Saving over a copy changed since the read would drop it; the banner asks first.
        if (file !== null && file.contents !== savedTextRef.current && file.contents !== text) {
          setConflict({ kind: "changed", diskText: file.contents });
          return;
        }
        return host.writeFile(path, text).then(() => {
          savedTextRef.current = text;
          setConflict(null);
          setDirty(editorText() !== text);
          keepUnsaved(path);
        });
      })
      .catch((cause: unknown) => setSaveError(errorMessage(cause)))
      .then(() => setSaving(false));
  });

  const open = useEffectEvent((container: HTMLDivElement, filePath: string, root: string) => {
    let cancelled = false;
    let app: EditorApp | null = null;
    let contentListener: { dispose(): void } | undefined;
    let releaseLanguageClient: (() => void) | undefined;
    void (async () => {
      try {
        const [file] = await Promise.all([host.readFile(filePath), startMonaco(appearance)]);
        if (cancelled) return;
        if (file === null) {
          setStatus({ kind: "missing" });
          return;
        }
        // Edits kept from an earlier mount come back; if the file changed since they began, the
        // conflict banner asks which copy to keep.
        const restored = restoreUnsaved(state, filePath, file.contents);
        app = new EditorApp({
          codeResources: {
            modified: { text: restored.text, uri: fileUri(root, filePath) },
          },
          readOnly: file.truncated,
          editorOptions: { readOnly: file.truncated },
        });
        await app.start(container);
        if (cancelled) return;
        appRef.current = app;
        savedTextRef.current = file.contents;
        setDirty(restored.dirty);
        setConflict(
          restored.conflictDiskText === null
            ? null
            : { kind: "changed", diskText: restored.conflictDiskText },
        );
        // Drops kept edits the file now holds.
        if (!restored.dirty) keepUnsaved(filePath);
        const editor = app.getEditor();
        // EditorApp's own text callback only attaches to models during start(), so listen to the
        // editor directly.
        contentListener = editor?.onDidChangeModelContent(() => {
          setDirty(editor.getValue() !== savedTextRef.current);
          if (keepUnsavedTimerRef.current !== null) clearTimeout(keepUnsavedTimerRef.current);
          keepUnsavedTimerRef.current = setTimeout(
            () => keepUnsaved(filePath),
            KEEP_UNSAVED_DELAY_MS,
          );
        });
        editor?.addAction({
          id: "t3code.save",
          label: "Save",
          keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
          run: () => save(),
        });
        if (TYPESCRIPT_FILE.test(filePath)) {
          releaseLanguageClient = acquireWorkspaceLanguageClient(
            `${environmentId}\u0000${root}`,
            root,
            host,
            setLanguageStatus,
          );
        }
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
      // Keep the latest edits before the editor goes, as on a thread switch.
      if (app !== null) keepUnsaved(filePath);
      contentListener?.dispose();
      releaseLanguageClient?.();
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

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the file again after the agent may have changed it, and when the tab is shown, since edits from elsewhere bump no revision
  useEffect(() => {
    if (visible) syncWithDisk(workspaceRevision);
  }, [visible, workspaceRevision]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- tells the panel and the browser about unsaved edits, so closing the tab or the page asks first
  useEffect(() => {
    if (!dirty) {
      host.setCloseWarning(null);
      return;
    }
    host.setCloseWarning(`${path ?? "This file"} has unsaved changes. Close it anyway?`);
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (path !== null) keepUnsaved(path);
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty, path, host]);

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
          disabled={!dirty || saving || status.kind !== "ready" || conflict?.kind === "changed"}
          onClick={() => save()}
        >
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </Button>
      </form>
      {conflict?.kind === "changed" ? (
        <div className="flex items-center gap-2 border-b bg-warning/10 px-3 py-1.5 text-xs">
          <span className="min-w-0 flex-1">
            The file changed on disk while you had unsaved edits.
          </span>
          <Button size="compact" variant="ghost" onClick={() => applyDiskText(conflict.diskText)}>
            Use disk version
          </Button>
          <Button
            size="compact"
            variant="ghost"
            onClick={() => {
              // Saving next replaces the disk's copy, which the user has now seen.
              savedTextRef.current = conflict.diskText;
              setConflict(null);
              setDirty(editorText() !== conflict.diskText);
              if (path !== null) keepUnsaved(path);
            }}
          >
            Keep mine
          </Button>
        </div>
      ) : conflict?.kind === "deleted" ? (
        <div className="flex items-center gap-2 border-b bg-warning/10 px-3 py-1.5 text-xs">
          <span className="min-w-0 flex-1">
            The file was deleted on disk. Saving creates it again.
          </span>
          <Button size="compact" variant="ghost" onClick={() => host.close()}>
            Close tab
          </Button>
          <Button size="compact" variant="ghost" onClick={() => setConflict(null)}>
            Keep editing
          </Button>
        </div>
      ) : null}
      {saveError ? (
        <div className="border-b px-3 py-1.5 text-destructive-foreground text-xs">{saveError}</div>
      ) : null}
      {path === null ? (
        <div className="p-3 text-muted-foreground text-sm">
          Enter a workspace-relative path, or open a file from the Files tab.
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
      {languageStatus ? (
        <div className="truncate border-t px-3 py-1 text-muted-foreground text-xs">
          {languageStatus.kind === "ready"
            ? "TypeScript language server ready"
            : languageStatus.kind === "starting"
              ? "Starting TypeScript language server…"
              : `TypeScript language server stopped. ${languageStatus.reason}`}
        </div>
      ) : null}
    </div>
  );
}
