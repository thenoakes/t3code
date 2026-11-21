import {
  FileSystemProviderCapabilities,
  FileSystemProviderError,
  FileSystemProviderErrorCode,
  FileType,
  type IFileSystemProviderWithFileReadWriteCapability,
  type IStat,
  registerFileSystemOverlay,
} from "@codingame/monaco-vscode-files-service-override";
import { Event } from "@codingame/monaco-vscode-api/vscode/vs/base/common/event";
import { Disposable } from "@codingame/monaco-vscode-api/vscode/vs/base/common/lifecycle";
import type { URI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";

import { locatePath } from "./workspaces";

// A stat and the read that follows it share one fetch.
const READ_CACHE_MS = 2_000;

const notFound = (uri: URI) =>
  FileSystemProviderError.create(
    `${uri.fsPath} is not in an open workspace`,
    FileSystemProviderErrorCode.FileNotFound,
  );
const readOnly = () =>
  FileSystemProviderError.create(
    "Workspace files are saved from their editor tab",
    FileSystemProviderErrorCode.NoPermissions,
  );

/**
 * Reads files of open workspaces through their panel host, so Monaco can show a definition or
 * reference in a file no editor has open. It never writes: Monaco keeps its own copies in a
 * memory layer above it, and only an editor tab's Save writes to disk.
 */
class WorkspaceFileSystemProvider implements IFileSystemProviderWithFileReadWriteCapability {
  // Not marked Readonly: Monaco would then treat every workspace file as read-only and refuse the
  // write an editor makes when it opens one. Writes reach the memory layer above first, and this
  // layer refuses any that get past it.
  readonly capabilities =
    FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;
  readonly onDidChangeCapabilities = Event.None;
  readonly onDidChangeFile = Event.None;
  private readonly reads = new Map<
    string,
    { readonly at: number; readonly bytes: Promise<Uint8Array | null> }
  >();

  private fetchBytes(uri: URI): Promise<Uint8Array | null> {
    const key = uri.toString();
    const cached = this.reads.get(key);
    if (cached && Date.now() - cached.at < READ_CACHE_MS) return cached.bytes;
    const target = locatePath(uri.fsPath);
    const bytes =
      target === null
        ? Promise.resolve(null)
        : (target.inWorkspace
            ? target.workspace.host.readFile(target.path)
            : target.workspace.host.readHostFile(target.path)
          )
            .then((file) => (file === null ? null : new TextEncoder().encode(file.contents)))
            // A folder, or a path the server will not read, is not a file here.
            .catch(() => null);
    this.reads.set(key, { at: Date.now(), bytes });
    return bytes;
  }

  watch() {
    return Disposable.None;
  }

  async stat(uri: URI): Promise<IStat> {
    const bytes = await this.fetchBytes(uri);
    if (bytes !== null) return { type: FileType.File, ctime: 0, mtime: 0, size: bytes.byteLength };
    const target = locatePath(uri.fsPath);
    // Folders outside every workspace are not listed; nothing here needs them.
    if (target === null || !target.inWorkspace) throw notFound(uri);
    await target.workspace.host.listDirectory(target.path).catch(() => {
      throw notFound(uri);
    });
    return { type: FileType.Directory, ctime: 0, mtime: 0, size: 0 };
  }

  async readFile(uri: URI): Promise<Uint8Array> {
    const bytes = await this.fetchBytes(uri);
    if (bytes === null) throw notFound(uri);
    return bytes;
  }

  async readdir(uri: URI): Promise<[string, FileType][]> {
    const target = locatePath(uri.fsPath);
    if (target === null || !target.inWorkspace) throw notFound(uri);
    const entries = await target.workspace.host.listDirectory(target.path).catch(() => {
      throw notFound(uri);
    });
    return entries.map((entry) => [
      entry.path.slice(entry.path.lastIndexOf("/") + 1),
      entry.kind === "directory" ? FileType.Directory : FileType.File,
    ]);
  }

  async writeFile(): Promise<void> {
    throw readOnly();
  }

  async mkdir(): Promise<void> {
    throw readOnly();
  }

  async delete(): Promise<void> {
    throw readOnly();
  }

  async rename(): Promise<void> {
    throw readOnly();
  }
}

let registered = false;

/** Adds the workspace layer under Monaco's memory file system, once per page. */
export function registerWorkspaceFileSystem(): void {
  if (registered) return;
  registered = true;
  registerFileSystemOverlay(-1, new WorkspaceFileSystemProvider());
}
