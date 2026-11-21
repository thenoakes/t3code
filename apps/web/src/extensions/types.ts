import type { EnvironmentId, ProjectId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import type { ComponentType } from "react";

/**
 * A side panel that lives in `extensions/panels/<id>/index.tsx` and opens as a right panel tab.
 * This file is the whole contract a panel builds against; panels should not import app internals.
 */
export interface PanelExtension<State = unknown> {
  /** Stable and unique. Saved in persisted panel state, so renaming it orphans open tabs. */
  readonly id: string;
  readonly title: string;
  /** Shown in the add-tab menu under the title. */
  readonly description?: string;
  readonly icon: ComponentType<{ className?: string }>;
  /** A single letter that opens the panel from the add-tab menu. Avoid B, T, F, D, P, L, M, S. */
  readonly shortcut?: string;
  /** Opens a new tab each time instead of focusing the existing one. */
  readonly multiple?: boolean;
  /** Must survive `JSON.stringify`: it is persisted with the tab. */
  readonly initialState: State;
  /** Wrap in `React.lazy` to keep a heavy panel out of the startup bundle. */
  readonly component: ComponentType<PanelProps<State>>;
}

export interface PanelThread {
  readonly id: ThreadId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly branch: string | null;
  readonly worktreePath: string | null;
}

export interface PanelProps<State = unknown> {
  readonly threadRef: ScopedThreadRef;
  readonly environmentId: EnvironmentId;
  /** Null until the thread loads, and for draft threads. */
  readonly thread: PanelThread | null;
  /** The project's checkout; absent outside a project. */
  readonly workspaceRoot: string | undefined;
  /** False while the panel or its tab is hidden. Pause polling and animation while false. */
  readonly visible: boolean;
  readonly state: State;
  readonly host: PanelHost<State>;
}

export interface PanelEntry {
  /** Workspace-relative, using `/`. */
  readonly path: string;
  readonly kind: "file" | "directory";
  /** Git ignores it, as with local settings files. */
  readonly ignored: boolean;
}

export interface PanelFile {
  readonly path: string;
  readonly contents: string;
  /** The file was too large to read whole; `contents` holds its start. */
  readonly truncated: boolean;
}

/** What a panel may ask of the app. Grow this deliberately rather than reaching into stores. */
export interface PanelHost<State = unknown> {
  /** Replaces this tab's persisted state. */
  setState(next: State): void;
  /** Appends to the thread's composer. False when no composer is ready. */
  insertIntoComposer(text: string): boolean;
  /** Opens a workspace file in a Files tab, optionally at a 1-based line. */
  openFile(relativePath: string, line?: number): void;
  /**
   * Lists a workspace folder's immediate children; `""` is the root. Rejects when the thread has no
   * workspace, the path leaves it, or the folder cannot be read.
   */
  listDirectory(relativePath: string): Promise<ReadonlyArray<PanelEntry>>;
  /** Reads a workspace text file, or null when it does not exist. Rejects like `listDirectory`. */
  readFile(relativePath: string): Promise<PanelFile | null>;
  /** Opens another extension panel by id. */
  openPanel(extensionId: string): void;
  /** Closes this tab. */
  close(): void;
}

/** Identity at runtime; keeps a panel's `State` checked against its component. */
export function definePanelExtension<State>(
  extension: PanelExtension<State>,
): PanelExtension<State> {
  return extension;
}
