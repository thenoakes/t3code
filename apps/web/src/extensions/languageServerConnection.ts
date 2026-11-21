import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, LanguageServerLanguage } from "@t3tools/contracts";
import { msg } from "gt-react";

import { m } from "~/i18n/messages";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { languageServerEnvironment } from "~/state/languageServers";
import type { PanelLanguageServerConnection } from "./types";

type Closed = Awaited<PanelLanguageServerConnection["closed"]>;

const failureMessage = (result: Parameters<typeof squashAtomCommandFailure>[0]) =>
  thrownErrorMessage(squashAtomCommandFailure(result), m) ?? m(msg("An error occurred."));

/** Runs a language server over the environment connection, for an extension panel. */
export function connectWorkspaceLanguageServer(
  environmentId: EnvironmentId,
  cwd: string | undefined,
  language: LanguageServerLanguage,
): PanelLanguageServerConnection {
  const abort = new AbortController();
  const listeners = new Set<(message: string) => void>();
  let sessionId: string | null = null;
  let exited: Omit<Closed, "error"> = { exitCode: null, stderr: "" };
  let resolveStarted!: (value: Awaited<PanelLanguageServerConnection["started"]>) => void;
  const started = new Promise<Awaited<PanelLanguageServerConnection["started"]>>((resolve) => {
    resolveStarted = resolve;
  });

  // One send in flight; whatever queues meanwhile goes in the next batch, keeping the order.
  let pending: string[] = [];
  let sending = false;
  const flush = () => {
    if (sending || sessionId === null || pending.length === 0 || abort.signal.aborted) return;
    const messages = pending;
    pending = [];
    sending = true;
    void runAtomCommand(
      appAtomRegistry,
      languageServerEnvironment.send,
      { environmentId, input: { sessionId, messages } },
      { reportFailure: false },
    ).then((result) => {
      sending = false;
      // A failed send means the session is gone; `closed` reports why.
      if (result._tag === "Success") flush();
    });
  };

  const closed: Promise<Closed> = cwd
    ? runAtomCommand(
        appAtomRegistry,
        languageServerEnvironment.connect,
        {
          environmentId,
          input: { cwd, language },
          onValue: (event) => {
            switch (event.type) {
              case "started":
                sessionId = event.sessionId;
                resolveStarted(
                  event.initializationOptions
                    ? { initializationOptions: event.initializationOptions }
                    : {},
                );
                flush();
                return;
              case "message":
                for (const listener of listeners) listener(event.message);
                return;
              case "exited":
                exited = { exitCode: event.exitCode, stderr: event.stderr };
                return;
            }
          },
        },
        { signal: abort.signal, reportFailure: false },
      ).then((result) => ({
        ...exited,
        error:
          result._tag === "Success" || isAtomCommandInterrupted(result)
            ? null
            : failureMessage(result),
      }))
    : Promise.resolve({ ...exited, error: m(msg("This thread has no workspace.")) });

  return {
    started,
    closed,
    onMessage: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send: (message) => {
      pending.push(message);
      flush();
    },
    close: () => abort.abort(),
  };
}
