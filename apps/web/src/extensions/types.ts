import type {
  EnvironmentId,
  LanguageServerLanguage,
  ProjectId,
  ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
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
  /** The tab's title for a given state, such as the open file's name. Defaults to `title`. */
  readonly tabTitle?: (state: State) => string | null;
  /** Offers "Open in <title>" on files in the Files tab, opening the panel with `state(path)`. */
  readonly fileHandler?: {
    readonly matches?: (relativePath: string) => boolean;
    readonly state: (relativePath: string) => State;
  };
  /**
   * App shortcuts, in keybinding syntax such as `"mod+f"`, that the panel handles itself while
   * focus is inside it. Every other app shortcut runs the app command, even where the panel's
   * own widgets, such as an embedded editor, would consume the key.
   */
  readonly ownShortcuts?: ReadonlyArray<string>;
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
  /** The app's rendered colour scheme, including a theme being previewed in settings. */
  readonly appearance: "light" | "dark";
  /**
   * Changes when the agent may have changed workspace files, so read again what the panel shows.
   * Edits from outside T3 Code do not change it.
   */
  readonly workspaceRevision: string | null;
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

/** A running language server, speaking serialized JSON-RPC messages. */
export interface PanelLanguageServerConnection {
  /**
   * Resolves once it runs, with options to merge into the `initialize` request. Stays pending
   * if it fails to start, which `closed` reports.
   */
  readonly started: Promise<{ readonly initializationOptions?: Record<string, unknown> }>;
  /** Resolves when it stops, for any reason, including `close`. Never rejects. */
  readonly closed: Promise<{
    readonly exitCode: number | null;
    readonly stderr: string;
    /** Why it could not start or was cut off, such as a missing install or a lost connection. */
    readonly error: string | null;
  }>;
  /** Receives each message in order. */
  onMessage(listener: (message: string) => void): () => void;
  /** Queued until it starts; sent in order. */
  send(message: string): void;
  close(): void;
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
  /**
   * Reads any text file on the machine that holds the workspace, by absolute path, as the Files
   * tab can. Read-only: for showing what lies outside the workspace, such as a dependency's
   * source that a definition points to. Null when it does not exist.
   */
  readHostFile(absolutePath: string): Promise<PanelFile | null>;
  /**
   * Replaces a workspace file's contents, creating it if needed. Rejects like `listDirectory`, and
   * when the connection may not write files. It does not check for changes made since the read.
   */
  writeFile(relativePath: string, contents: string): Promise<void>;
  /**
   * Starts a language server in the thread's workspace, on the machine that holds it. Needs the
   * connection's terminal permission, since a language server runs project code.
   */
  connectLanguageServer(language: LanguageServerLanguage): PanelLanguageServerConnection;
  /**
   * Opens an extension panel by id. With `state`, a panel that allows several tabs focuses the tab
   * whose state holds every top-level field of it, or opens one with it, and a single-tab panel
   * takes it.
   */
  openPanel(extensionId: string, state?: unknown): void;
  /** Closes this tab. */
  close(): void;
  /**
   * While set, closing this tab, alone or with others, asks the user first with this message.
   * Set it while the panel holds unsaved work, and back to null once that work is saved.
   */
  setCloseWarning(message: string | null): void;
}

/** Identity at runtime; keeps a panel's `State` checked against its component. */
export function definePanelExtension<State>(
  extension: PanelExtension<State>,
): PanelExtension<State> {
  return extension;
}
