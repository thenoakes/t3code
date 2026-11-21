import { Uri } from "@codingame/monaco-vscode-editor-api";
import { MonacoLanguageClient } from "monaco-languageclient";
import {
  AbstractMessageReader,
  AbstractMessageWriter,
  CloseAction,
  type DataCallback,
  type Disposable,
  ErrorAction,
  type Message,
} from "vscode-languageclient/browser";

import type { PanelHost, PanelLanguageServerConnection } from "../../types";

type LanguageServerHost = Pick<PanelHost, "connectLanguageServer">;

export type LanguageClientStatus =
  | { readonly kind: "starting" }
  | { readonly kind: "ready" }
  | { readonly kind: "stopped"; readonly reason: string };

// A server that stops on its own is started again after this, while editors still use it.
const RESTART_DELAY_MS = 3_000;
// Closing the last editor keeps the server briefly, so switching tabs does not restart it.
const IDLE_STOP_DELAY_MS = 30_000;

class ConnectionReader extends AbstractMessageReader {
  constructor(private readonly connection: PanelLanguageServerConnection) {
    super();
    void connection.closed.then(() => this.fireClose());
  }

  listen(callback: DataCallback): Disposable {
    const unsubscribe = this.connection.onMessage((message) => {
      try {
        callback(JSON.parse(message) as Message);
      } catch (cause) {
        this.fireError(cause);
      }
    });
    return { dispose: unsubscribe };
  }
}

class ConnectionWriter extends AbstractMessageWriter {
  constructor(private readonly connection: PanelLanguageServerConnection) {
    super();
  }

  async write(message: Message): Promise<void> {
    this.connection.send(JSON.stringify(message));
  }

  end(): void {}
}

function describeStop(closed: Awaited<PanelLanguageServerConnection["closed"]>): string {
  if (closed.error) return closed.error;
  const detail = closed.stderr.split("\n").at(-1)?.trim();
  return `The language server exited${closed.exitCode === null ? "" : ` with code ${closed.exitCode}`}${detail ? `: ${detail}` : "."}`;
}

/** One language client per workspace, shared by every editor showing files from it. */
class WorkspaceLanguageClient {
  private users = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private current: {
    readonly connection: PanelLanguageServerConnection;
    readonly languageClient: MonacoLanguageClient;
  } | null = null;
  private status: LanguageClientStatus = { kind: "starting" };
  private readonly listeners = new Set<(status: LanguageClientStatus) => void>();

  constructor(
    private readonly workspaceRoot: string,
    // The newest editor's host, which outlives the closed ones that started the client.
    private host: LanguageServerHost,
    private readonly onIdle: () => void,
  ) {}

  acquire(host: LanguageServerHost): () => void {
    this.host = host;
    this.users += 1;
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (this.current === null && this.restartTimer === null) this.start();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.users -= 1;
      if (this.users > 0) return;
      this.idleTimer = setTimeout(() => {
        this.stop();
        this.onIdle();
      }, IDLE_STOP_DELAY_MS);
    };
  }

  subscribe(listener: (status: LanguageClientStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: LanguageClientStatus): void {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  private start(): void {
    this.setStatus({ kind: "starting" });
    const connection = this.host.connectLanguageServer("typescript");
    const client = new MonacoLanguageClient({
      name: "TypeScript",
      clientOptions: {
        // Only this workspace's files, so two open workspaces never both answer for one file.
        documentSelector: ["typescript", "typescriptreact"].map((language) => ({
          scheme: "file",
          language,
          pattern: `${this.workspaceRoot.replace(/[\\/]+$/, "")}/**`,
        })),
        workspaceFolder: {
          index: 0,
          name: this.workspaceRoot.split(/[\\/]/).at(-1) ?? this.workspaceRoot,
          uri: Uri.file(this.workspaceRoot),
        },
        // Restarts are handled here, with a fresh server and connection.
        errorHandler: {
          error: () => ({ action: ErrorAction.Continue }),
          closed: () => ({ action: CloseAction.DoNotRestart }),
        },
      },
      messageTransports: {
        reader: new ConnectionReader(connection),
        writer: new ConnectionWriter(connection),
      },
    });
    const current = { connection, languageClient: client };
    this.current = current;

    void connection.started.then(async ({ initializationOptions }) => {
      if (this.current !== current) return;
      client.clientOptions.initializationOptions = initializationOptions;
      try {
        await client.start();
        if (this.current === current) this.setStatus({ kind: "ready" });
      } catch (cause) {
        if (this.current === current) {
          this.setStatus({
            kind: "stopped",
            reason: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
    });
    void connection.closed.then((closed) => {
      if (this.current !== current) return;
      this.current = null;
      void client.dispose().catch(() => undefined);
      this.setStatus({ kind: "stopped", reason: describeStop(closed) });
      // A server that never started (not installed, no permission) is not retried.
      if (this.users > 0 && closed.error === null) {
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null;
          if (this.users > 0 && this.current === null) this.start();
        }, RESTART_DELAY_MS);
      }
    });
  }

  private stop(): void {
    if (this.restartTimer !== null) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const current = this.current;
    this.current = null;
    if (!current) return;
    void current.languageClient.dispose().catch(() => undefined);
    current.connection.close();
  }
}

const clients = new Map<string, WorkspaceLanguageClient>();

/**
 * Shares a workspace's TypeScript language client among its editors. The returned function
 * releases this editor's use; the last release stops the client after a short idle delay.
 */
export function acquireWorkspaceLanguageClient(
  key: string,
  workspaceRoot: string,
  host: LanguageServerHost,
  onStatus: (status: LanguageClientStatus) => void,
): () => void {
  let client = clients.get(key);
  if (!client) {
    const created = new WorkspaceLanguageClient(workspaceRoot, host, () => {
      if (clients.get(key) === created) clients.delete(key);
    });
    clients.set(key, created);
    client = created;
  }
  const unsubscribe = client.subscribe(onStatus);
  const release = client.acquire(host);
  return () => {
    unsubscribe();
    release();
  };
}
