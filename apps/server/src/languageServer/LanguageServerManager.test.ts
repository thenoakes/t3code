import * as NodeServices from "@effect/platform-node/NodeServices";
import type { LanguageServerConnectEvent } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import * as LanguageServerManager from "./LanguageServerManager.ts";

// Answers each request with its cwd and params, and exits with code 3 on `exit`.
const FAKE_LANGUAGE_SERVER = `#!/usr/bin/env node
let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const end = buffer.indexOf("\\r\\n\\r\\n");
    if (end < 0) return;
    const length = Number(/Content-Length: (\\d+)/i.exec(buffer.subarray(0, end).toString())[1]);
    if (buffer.length < end + 4 + length) return;
    const message = JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString());
    buffer = buffer.subarray(end + 4 + length);
    if (message.method === "exit") {
      process.stderr.write("bye");
      process.exit(3);
    }
    const body = JSON.stringify({ id: message.id, result: { cwd: process.cwd(), echo: message.params } });
    process.stdout.write("Content-Length: " + Buffer.byteLength(body) + "\\r\\n\\r\\n" + body);
  }
});
`;

const layer = LanguageServerManager.layer.pipe(Layer.provideMerge(NodeServices.layer));

const workspaceWithFakeServer = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const cwd = yield* fileSystem.makeTempDirectoryScoped();
  const bin = path.join(cwd, "node_modules", ".bin");
  yield* fileSystem.makeDirectory(bin, { recursive: true });
  const script = path.join(bin, "typescript-language-server");
  yield* fileSystem.writeFileString(script, FAKE_LANGUAGE_SERVER);
  yield* fileSystem.chmod(script, 0o755);
  return cwd;
});

describe("LanguageServerManager", () => {
  it.effect("runs the workspace's language server for as long as the stream runs", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const cwd = yield* workspaceWithFakeServer;
      const manager = yield* LanguageServerManager.LanguageServerManager;
      const events = yield* Queue.unbounded<LanguageServerConnectEvent>();
      const fiber = yield* manager.connect({ cwd, language: "typescript" }).pipe(
        Stream.runForEach((event) => Queue.offer(events, event)),
        Effect.forkScoped,
      );

      const started = yield* Queue.take(events);
      if (started.type !== "started") throw new Error(`expected started, got ${started.type}`);
      expect(started.command).toMatch(/node_modules\/\.bin\/typescript-language-server$/);

      yield* manager.send({
        sessionId: started.sessionId,
        message: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { x: "é" },
        }),
      });
      const reply = yield* Queue.take(events);
      if (reply.type !== "message") throw new Error(`expected message, got ${reply.type}`);
      expect(JSON.parse(reply.message)).toEqual({
        id: 1,
        result: { cwd: yield* fileSystem.realPath(cwd), echo: { x: "é" } },
      });

      yield* manager.send({
        sessionId: started.sessionId,
        message: JSON.stringify({ jsonrpc: "2.0", method: "exit" }),
      });
      expect(yield* Queue.take(events)).toEqual({ type: "exited", exitCode: 3, stderr: "bye" });
      yield* Fiber.join(fiber);

      // The session ends with the stream.
      const late = yield* manager
        .send({ sessionId: started.sessionId, message: "{}" })
        .pipe(Effect.exit);
      expect(Exit.isFailure(late)).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(layer)),
  );

  it.effect("fails with install advice when no language server is found", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const cwd = yield* fileSystem.makeTempDirectoryScoped();
      const manager = yield* LanguageServerManager.LanguageServerManager;
      const error = yield* manager
        .connect({ cwd, language: "typescript" })
        .pipe(Stream.runDrain, Effect.flip);
      expect(error._tag).toBe("LanguageServerNotFoundError");
      expect(error.message).toContain("npm install -g typescript-language-server");
    }).pipe(
      Effect.scoped,
      Effect.provideService(HostProcess.Environment, { PATH: "" }),
      Effect.provide(layer),
    ),
  );
});
