import { WS_METHODS } from "@t3tools/contracts";
import type { Atom } from "effect/reactivity";

import type * as EnvironmentRegistry from "../connection/registry.ts";
import { createEnvironmentRpcCommand, createEnvironmentRpcStreamCommand } from "./runtime.ts";

export function createLanguageServerEnvironmentCommands<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry.EnvironmentRegistry | R, E>,
) {
  return {
    /**
     * Runs a language server until it exits or the run is interrupted, for example through
     * `runAtomCommand`'s `signal`. A dropped connection ends it; the caller starts a new one,
     * since the language server's state does not survive.
     */
    connect: createEnvironmentRpcStreamCommand(runtime, {
      label: "environment-data:language-server:connect",
      tag: WS_METHODS.languageServerConnect,
    }),
    send: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:language-server:send",
      tag: WS_METHODS.languageServerSend,
    }),
  };
}
