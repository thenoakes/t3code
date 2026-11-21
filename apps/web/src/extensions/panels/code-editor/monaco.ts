// Loaded only with the code editor panel: monaco-vscode-api is several MB and sets up VS Code's
// services for the whole page, once.
import "@codingame/monaco-vscode-theme-defaults-default-extension";
import "@codingame/monaco-vscode-typescript-basics-default-extension";
import { LogLevel } from "@codingame/monaco-vscode-api";
import { updateUserConfiguration } from "@codingame/monaco-vscode-configuration-service-override";
import editorWorkerUrl from "@codingame/monaco-vscode-editor-api/esm/vs/editor/editor.worker.js?worker&url";
import textMateWorkerUrl from "@codingame/monaco-vscode-textmate-service-override/worker?worker&url";
import { MonacoVscodeApiWrapper } from "monaco-languageclient/vscodeApiWrapper";
import { useWorkerFactory, Worker } from "monaco-languageclient/workerFactory";

import { openEditorAt, type RevealTarget } from "./navigation";
import { registerWorkspaceFileSystem } from "./workspaceFileSystem";

const THEMES = { light: "Light Modern", dark: "Dark Modern" } as const;

function userConfiguration(appearance: "light" | "dark"): string {
  return JSON.stringify({
    "workbench.colorTheme": THEMES[appearance],
    "editor.fontSize": 13,
    "editor.minimap.enabled": false,
    "editor.scrollBeyondLastLine": false,
    "editor.automaticLayout": true,
  });
}

let started: Promise<void> | undefined;
let currentAppearance: "light" | "dark" | undefined;

/** Starts the VS Code services on first use and keeps their theme on the app's. */
export async function startMonaco(appearance: "light" | "dark"): Promise<void> {
  if (!started) {
    currentAppearance = appearance;
    started = new MonacoVscodeApiWrapper({
      $type: "extended",
      viewsConfig: {
        $type: "EditorService",
        // Go-to-definition into another file opens it in its own editor tab.
        openEditorFunc: async (modelRef, options) => {
          // Text editor options, which carry the place to show.
          const selection = (options as { readonly selection?: RevealTarget } | undefined)
            ?.selection;
          openEditorAt(modelRef.object.textEditorModel.uri.fsPath, selection);
          modelRef.dispose();
          return undefined;
        },
      },
      logLevel: LogLevel.Warning,
      userConfiguration: { json: userConfiguration(appearance) },
      monacoWorkerFactory: (logger) =>
        useWorkerFactory({
          ...(logger ? { logger } : {}),
          workerLoaders: {
            editorWorkerService: () => new Worker(editorWorkerUrl, { type: "module" }),
            TextMateWorker: () => new Worker(textMateWorkerUrl, { type: "module" }),
          },
        }),
    })
      .start()
      .then(() => registerWorkspaceFileSystem());
    // A failed start can be retried by opening the panel again.
    started.catch(() => {
      started = undefined;
    });
  }
  await started;
  if (currentAppearance !== appearance) {
    currentAppearance = appearance;
    await updateUserConfiguration(userConfiguration(appearance));
  }
}
