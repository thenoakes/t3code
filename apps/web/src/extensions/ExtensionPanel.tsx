import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { matchesKeybindingShortcut, parseKeybindingShortcut } from "@t3tools/shared/keybindings";
import { useGT } from "gt-react";
import { type KeyboardEvent, Suspense, useEffect, useRef } from "react";

import { useComposerHandleContext } from "~/composerHandleContext";
import { useRenderedAppearance } from "~/hooks/useTheme";
import { RenderErrorBoundary } from "~/components/RenderErrorBoundary";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { registerRightPanelCloseGuard } from "~/rightPanelCloseGuards";
import { type ExtensionSurface, rightPanelHostRef, useRightPanelStore } from "~/rightPanelStore";
import { dispatchShortcutKeyDown, hasCommandForKeyDown } from "~/shortcuts/dispatcher";
import { useThreadShell } from "~/state/entities";
import { getPanelExtension } from "./registry";
import type { PanelHost, PanelThread } from "./types";
import { connectWorkspaceLanguageServer } from "./languageServerConnection";
import { listWorkspaceDirectory, readWorkspaceFile, writeWorkspaceFile } from "./workspaceFiles";

/** Renders an extension surface, keeping a broken or missing extension inside its own tab. */
export function ExtensionPanel(props: {
  readonly surface: ExtensionSurface;
  readonly threadRef: ScopedThreadRef;
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string | undefined;
  readonly workspaceRevision: string | null;
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const { surface, threadRef, onClose } = props;
  const gt = useGT();
  const extension = getPanelExtension(surface.extensionId);
  const composerRef = useComposerHandleContext();
  const shell = useThreadShell(threadRef);
  const appearance = useRenderedAppearance();
  const closeWarningRef = useRef<string | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers this tab with the panel's close guards, an external registry, for as long as it is mounted
  useEffect(
    () =>
      registerRightPanelCloseGuard(
        scopedThreadKey(rightPanelHostRef(threadRef)),
        surface.id,
        () => closeWarningRef.current,
      ),
    [threadRef, surface.id],
  );
  // The React Compiler memoizes these, so the panel only re-renders when they change.
  const thread: PanelThread | null =
    shell === null
      ? null
      : {
          id: shell.id,
          projectId: shell.projectId,
          title: shell.title,
          branch: shell.branch,
          worktreePath: shell.worktreePath,
        };
  const host: PanelHost = {
    setState: (next) =>
      useRightPanelStore.getState().setExtensionState(threadRef, surface.id, next),
    insertIntoComposer: (text) =>
      composerRef?.current?.insertTextAtEnd(text, { ensureLeadingBoundary: true }) === true,
    openFile: (relativePath, line) =>
      useRightPanelStore.getState().openFile(threadRef, relativePath, line),
    listDirectory: (relativePath) =>
      listWorkspaceDirectory(props.environmentId, props.workspaceRoot, relativePath),
    readFile: (relativePath) =>
      readWorkspaceFile(props.environmentId, props.workspaceRoot, relativePath),
    connectLanguageServer: (language) =>
      connectWorkspaceLanguageServer(props.environmentId, props.workspaceRoot, language),
    writeFile: (relativePath, contents) =>
      writeWorkspaceFile(props.environmentId, props.workspaceRoot, relativePath, contents),
    openPanel: (extensionId, state) =>
      useRightPanelStore.getState().openExtension(threadRef, extensionId, {
        multiple: getPanelExtension(extensionId)?.multiple,
        ...(state === undefined ? {} : { state }),
      }),
    close: onClose,
    setCloseWarning: (message) => {
      closeWarningRef.current = message;
    },
  };

  if (!extension) {
    return (
      <Empty size="compact">
        <EmptyHeader>
          <EmptyTitle>{gt("Panel not installed")}</EmptyTitle>
          <EmptyDescription>
            {gt("No extension named {id} is installed in this build.", { id: surface.extensionId })}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const Component = extension.component;
  const ownShortcuts = (extension.ownShortcuts ?? []).flatMap(
    (key) => parseKeybindingShortcut(key) ?? [],
  );
  // Widgets such as an embedded editor stop keys they handle, so app shortcuts are routed here,
  // before the event reaches them, unless the panel owns the shortcut.
  const routeAppShortcut = (event: KeyboardEvent) => {
    const keydown = event.nativeEvent;
    if (
      !hasCommandForKeyDown(keydown) ||
      ownShortcuts.some((shortcut) =>
        matchesKeybindingShortcut(keydown, shortcut, navigator.platform),
      )
    ) {
      return;
    }
    event.stopPropagation();
    dispatchShortcutKeyDown(keydown);
  };
  return (
    <RenderErrorBoundary
      resetKeys={[extension]}
      fallback={
        <Empty size="compact">
          <EmptyHeader>
            <EmptyTitle>{gt("This panel crashed")}</EmptyTitle>
            <EmptyDescription>
              {gt("{title} hit an error. Check the console, then reopen the tab.", {
                title: extension.title,
              })}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    >
      <Suspense fallback={null}>
        <div className="contents" onKeyDownCapture={routeAppShortcut}>
          <Component
            threadRef={threadRef}
            environmentId={props.environmentId}
            thread={thread}
            workspaceRoot={props.workspaceRoot}
            visible={props.visible}
            appearance={appearance}
            workspaceRevision={props.workspaceRevision}
            state={surface.state === undefined ? extension.initialState : surface.state}
            host={host}
          />
        </div>
      </Suspense>
    </RenderErrorBoundary>
  );
}
