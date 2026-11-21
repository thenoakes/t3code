// @effect-diagnostics-next-line nodeBuiltinImport:off -- session ids, as attachment ids use.
import * as NodeCrypto from "node:crypto";

import {
  type LanguageServerConnectEvent,
  type LanguageServerConnectInput,
  type LanguageServerLanguage,
  LanguageServerNotFoundError,
  type LanguageServerSendInput,
  LanguageServerSessionNotFoundError,
  LanguageServerStartError,
} from "@t3tools/contracts";
import { resolveCommandPath } from "@t3tools/shared/shell";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import { encodeLanguageServerMessage, LanguageServerMessageDecoder } from "./framing.ts";

/** The command each language runs, preferring the workspace's own install over PATH. */
const LANGUAGE_SERVER_COMMANDS: Record<
  LanguageServerLanguage,
  { readonly command: string; readonly args: ReadonlyArray<string> }
> = {
  typescript: { command: "typescript-language-server", args: ["--stdio"] },
};

// Enough of stderr to explain a server that exits at startup.
const STDERR_TAIL_LENGTH = 4_000;

export class LanguageServerManager extends Context.Service<
  LanguageServerManager,
  {
    /**
     * Starts a language server for the stream's lifetime. Its first event names the session that
     * `send` writes to; ending the stream stops the server.
     */
    readonly connect: (
      input: LanguageServerConnectInput,
    ) => Stream.Stream<
      LanguageServerConnectEvent,
      LanguageServerNotFoundError | LanguageServerStartError
    >;
    readonly send: (
      input: LanguageServerSendInput,
    ) => Effect.Effect<void, LanguageServerSessionNotFoundError>;
  }
>()("t3/languageServer/LanguageServerManager") {}

const make = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sessions = new Map<string, Queue.Queue<Uint8Array>>();

  const resolveCommand = Effect.fn("LanguageServerManager.resolveCommand")(function* (
    input: LanguageServerConnectInput,
  ) {
    const { command } = LANGUAGE_SERVER_COMMANDS[input.language];
    const local = path.join(input.cwd, "node_modules", ".bin", command);
    if (yield* fileSystem.exists(local).pipe(Effect.orElseSucceed(() => false))) return local;
    const onPath = yield* resolveCommandPath(command).pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
    );
    if (onPath) return onPath;
    return yield* new LanguageServerNotFoundError({ language: input.language, command });
  });

  // typescript-language-server needs a TypeScript install; a workspace without one, such as one
  // that compiles with the native preview, borrows the one whose tsserver is on PATH.
  const resolveInitializationOptions = Effect.fn(
    "LanguageServerManager.resolveInitializationOptions",
  )(function* (input: LanguageServerConnectInput) {
    if (input.language !== "typescript") return undefined;
    const exists = (file: string) =>
      fileSystem.exists(file).pipe(Effect.orElseSucceed(() => false));
    if (yield* exists(path.join(input.cwd, "node_modules", "typescript", "lib", "tsserver.js"))) {
      return undefined;
    }
    const tsserver = yield* resolveCommandPath("tsserver").pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
    );
    if (!tsserver) return undefined;
    const binary = yield* fileSystem.realPath(tsserver).pipe(Effect.orElseSucceed(() => tsserver));
    const lib = path.join(path.dirname(binary), "..", "lib");
    if (!(yield* exists(path.join(lib, "tsserver.js")))) return undefined;
    return { tsserver: { path: path.join(lib, "tsserver.js") } };
  });

  const connect = (input: LanguageServerConnectInput) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const command = yield* resolveCommand(input);
        const initializationOptions = yield* resolveInitializationOptions(input);
        const child = yield* spawner
          .spawn(
            ChildProcess.make(command, [...LANGUAGE_SERVER_COMMANDS[input.language].args], {
              cwd: input.cwd,
              detached: false,
              shell: false,
              stdin: "pipe",
              stdout: "pipe",
              stderr: "pipe",
            }),
          )
          .pipe(
            Effect.mapError(
              (cause) =>
                new LanguageServerStartError({ language: input.language, cwd: input.cwd, cause }),
            ),
          );

        const sessionId = NodeCrypto.randomUUID();
        const stdin = yield* Queue.unbounded<Uint8Array>();
        sessions.set(sessionId, stdin);
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            sessions.delete(sessionId);
          }),
        );
        yield* Effect.logInfo("language server started", {
          language: input.language,
          cwd: input.cwd,
          pid: Number(child.pid),
        });
        yield* Stream.fromQueue(stdin).pipe(
          Stream.run(child.stdin),
          Effect.catchCause((cause) =>
            Effect.logWarning("language server stdin closed", { cause }),
          ),
          Effect.forkScoped,
        );

        let stderrTail = "";
        yield* child.stderr.pipe(
          Stream.decodeText(),
          Stream.runForEach((text) =>
            Effect.sync(() => {
              stderrTail = (stderrTail + text).slice(-STDERR_TAIL_LENGTH);
            }),
          ),
          Effect.ignore,
          Effect.forkScoped,
        );

        const decoder = new LanguageServerMessageDecoder();
        const output = child.stdout.pipe(
          Stream.map((chunk) => decoder.push(chunk)),
          Stream.flattenIterable,
          Stream.map((message): LanguageServerConnectEvent => ({ type: "message", message })),
          Stream.catchCause(() => Stream.empty),
        );
        const exited = Stream.fromEffect(
          child.exitCode.pipe(
            Effect.map(Number),
            Effect.orElseSucceed(() => null),
            Effect.map((exitCode): LanguageServerConnectEvent => ({
              type: "exited",
              exitCode,
              stderr: stderrTail.trim(),
            })),
          ),
        );
        return Stream.concat(
          Stream.succeed<LanguageServerConnectEvent>({
            type: "started",
            sessionId,
            command,
            ...(initializationOptions ? { initializationOptions } : {}),
          }),
          Stream.concat(output, exited),
        );
      }),
    );

  const send = Effect.fn("LanguageServerManager.send")(function* (input: LanguageServerSendInput) {
    const stdin = sessions.get(input.sessionId);
    if (!stdin) {
      return yield* new LanguageServerSessionNotFoundError({ sessionId: input.sessionId });
    }
    yield* Queue.offer(stdin, encodeLanguageServerMessage(input.message));
  });

  return LanguageServerManager.of({ connect, send });
});

export const layer = Layer.effect(LanguageServerManager, make);
