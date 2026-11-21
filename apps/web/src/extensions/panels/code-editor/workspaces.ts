import type { PanelHost } from "../../types";

/** What the shared Monaco services need from an editor's panel host. */
export type WorkspaceHost = Pick<
  PanelHost,
  "readFile" | "readHostFile" | "listDirectory" | "openPanel"
>;

interface Workspace {
  readonly key: string;
  readonly root: string;
  host: WorkspaceHost;
  users: number;
}

// Workspaces with an open editor, so Monaco's page-wide services can reach their files.
const workspaces = new Map<string, Workspace>();
// Model URIs that an editor tab shows; edits to other files have nowhere to be saved.
const openFiles = new Map<string, number>();

const normalize = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");

/** Registers a workspace while an editor on it is open; the newest editor's host serves it. */
export function registerWorkspace(key: string, root: string, host: WorkspaceHost): () => void {
  const existing = workspaces.get(key);
  const workspace = existing ?? { key, root: normalize(root), host, users: 0 };
  workspace.host = host;
  workspace.users += 1;
  // Re-inserted so it counts as the newest for paths outside every workspace.
  workspaces.delete(key);
  workspaces.set(key, workspace);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    workspace.users -= 1;
    if (workspace.users === 0 && workspaces.get(key) === workspace) workspaces.delete(key);
  };
}

/** The open workspace holding an absolute path, preferring the deepest root, as for a worktree. */
export function workspaceForPath(
  absolutePath: string,
): { readonly workspace: Workspace; readonly relativePath: string } | null {
  const path = normalize(absolutePath);
  let best: Workspace | null = null;
  for (const workspace of workspaces.values()) {
    if (path !== workspace.root && !path.startsWith(`${workspace.root}/`)) continue;
    if (best === null || workspace.root.length > best.root.length) best = workspace;
  }
  if (best === null) return null;
  return { workspace: best, relativePath: path.slice(best.root.length).replace(/^\//, "") };
}

/** A path the editor may address by absolute path, as for files outside every workspace. */
export const isAbsolutePath = (path: string) => /^(?:\/|[A-Za-z]:[\\/])/.test(path);

/**
 * Where to read an absolute path: its workspace and relative path, or else the newest
 * workspace's host with the absolute path, read-only, for a dependency outside the workspace.
 */
export function locatePath(
  absolutePath: string,
): { readonly workspace: Workspace; readonly path: string; readonly inWorkspace: boolean } | null {
  const inside = workspaceForPath(absolutePath);
  if (inside !== null && inside.relativePath !== "") {
    return { workspace: inside.workspace, path: inside.relativePath, inWorkspace: true };
  }
  // Maps keep insertion order, so the last one is the newest registered.
  const newest = [...workspaces.values()].at(-1);
  return newest ? { workspace: newest, path: normalize(absolutePath), inWorkspace: false } : null;
}

export function registerOpenFile(uri: string): () => void {
  openFiles.set(uri, (openFiles.get(uri) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (openFiles.get(uri) ?? 1) - 1;
    if (count === 0) openFiles.delete(uri);
    else openFiles.set(uri, count);
  };
}

export function isOpenFile(uri: string): boolean {
  return openFiles.has(uri);
}
