import { createLanguageServerEnvironmentCommands } from "@t3tools/client-runtime/state/languageServer";

import { connectionAtomRuntime } from "../connection/runtime";

export const languageServerEnvironment =
  createLanguageServerEnvironmentCommands(connectionAtomRuntime);
