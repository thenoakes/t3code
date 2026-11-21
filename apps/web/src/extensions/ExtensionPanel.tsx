import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { Suspense } from "react";

import { useComposerHandleContext } from "~/composerHandleContext";
import { RenderErrorBoundary } from "~/components/RenderErrorBoundary";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { type ExtensionSurface, useRightPanelStore } from "~/rightPanelStore";
import { useThreadShell } from "~/state/entities";
import { getPanelExtension } from "./registry";
import type { PanelHost, PanelThread } from "./types";

/** Renders an extension surface, keeping a broken or missing extension inside its own tab. */
export function ExtensionPanel(props: {
  readonly surface: ExtensionSurface;
  readonly threadRef: ScopedThreadRef;
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string | undefined;
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const { surface, threadRef, onClose } = props;
  const gt = useGT();
  const extension = getPanelExtension(surface.extensionId);
  const composerRef = useComposerHandleContext();
  const shell = useThreadShell(threadRef);
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
    openPanel: (extensionId) =>
      useRightPanelStore.getState().openExtension(threadRef, extensionId, {
        multiple: getPanelExtension(extensionId)?.multiple,
      }),
    close: onClose,
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
        <Component
          threadRef={threadRef}
          environmentId={props.environmentId}
          thread={thread}
          workspaceRoot={props.workspaceRoot}
          visible={props.visible}
          state={surface.state === undefined ? extension.initialState : surface.state}
          host={host}
        />
      </Suspense>
    </RenderErrorBoundary>
  );
}
