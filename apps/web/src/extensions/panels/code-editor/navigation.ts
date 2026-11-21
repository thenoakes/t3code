import { locatePath } from "./workspaces";

export interface RevealTarget {
  readonly startLineNumber: number;
  readonly startColumn: number;
  readonly endLineNumber?: number;
  readonly endColumn?: number;
}

const pendingReveals = new Map<string, RevealTarget>();
const listeners = new Set<() => void>();

const revealKey = (workspaceKey: string, path: string) => `${workspaceKey}\u0000${path}`;

/**
 * Opens a file in a code editor tab and moves it to `selection`, as go-to-definition into another
 * file does. A file outside every workspace opens by absolute path, read-only. False when no
 * editor is open to reach the file through.
 */
export function openEditorAt(absolutePath: string, selection: RevealTarget | undefined): boolean {
  const target = locatePath(absolutePath);
  if (target === null) return false;
  if (selection) pendingReveals.set(revealKey(target.workspace.key, target.path), selection);
  target.workspace.host.openPanel("code-editor", { path: target.path });
  for (const listener of listeners) listener();
  return true;
}

/** Takes the selection waiting for this file's editor, if any. */
export function takeReveal(workspaceKey: string, path: string): RevealTarget | undefined {
  const key = revealKey(workspaceKey, path);
  const target = pendingReveals.get(key);
  pendingReveals.delete(key);
  return target;
}

/** Called when a reveal is requested, for an editor that is already open. */
export function onRevealRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
