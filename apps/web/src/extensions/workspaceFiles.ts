import type { EnvironmentId } from "@t3tools/contracts";
import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import {
  executeAtomQuery,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { msg } from "gt-react";

import { getProjectFileQueryAtom } from "~/components/files/projectFilesQueryState";
import { m } from "~/i18n/messages";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { projectEnvironment } from "~/state/projects";
import type { PanelEntry, PanelFile } from "./types";

const QUERY_OPTIONS = { refresh: true, reportFailure: false, reportDefect: false } as const;

/** Panels get workspace-relative paths only, though the read RPC also accepts host paths. */
function workspacePath(
  cwd: string | undefined,
  relativePath: string,
): { readonly cwd: string; readonly path: string } {
  if (!cwd) throw new Error(m(msg("This thread has no workspace.")));
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\.\/|\/+$/g, "");
  if (
    /^(?:\/|~|[A-Za-z]:)/.test(normalized) ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(m(msg("''{path}'' is outside the workspace.", { path: relativePath })));
  }
  return { cwd, path: normalized };
}

function failure(result: Parameters<typeof squashAtomCommandFailure>[0]): Error {
  const cause = squashAtomCommandFailure(result);
  return new Error(thrownErrorMessage(cause, m) ?? m(msg("Workspace query failed.")), { cause });
}

export async function listWorkspaceDirectory(
  environmentId: EnvironmentId,
  cwd: string | undefined,
  relativePath: string,
): Promise<ReadonlyArray<PanelEntry>> {
  const { cwd: root, path: directoryPath } = workspacePath(cwd, relativePath);
  const result = await executeAtomQuery(
    appAtomRegistry,
    projectEnvironment.listEntries({ environmentId, input: { cwd: root, directoryPath } }),
    QUERY_OPTIONS,
  );
  if (result._tag === "Failure") throw failure(result);
  // A listing can include deeper entries; keep the folder's own children.
  return result.value.entries
    .filter(
      (entry) => entry.path.slice(0, Math.max(0, entry.path.lastIndexOf("/"))) === directoryPath,
    )
    .map((entry) => ({ path: entry.path, kind: entry.kind, ignored: entry.ignored === true }));
}

export async function readWorkspaceFile(
  environmentId: EnvironmentId,
  cwd: string | undefined,
  relativePath: string,
): Promise<PanelFile | null> {
  const { cwd: root, path } = workspacePath(cwd, relativePath);
  const result = await executeAtomQuery(
    appAtomRegistry,
    projectEnvironment.readFile({
      environmentId,
      input: { cwd: root, relativePath: path, allowMissing: true },
    }),
    QUERY_OPTIONS,
  );
  if (result._tag === "Failure") throw failure(result);
  if (result.value.exists === false) return null;
  return { path, contents: result.value.contents, truncated: result.value.truncated };
}

export async function writeWorkspaceFile(
  environmentId: EnvironmentId,
  cwd: string | undefined,
  relativePath: string,
  contents: string,
): Promise<void> {
  const { cwd: root, path } = workspacePath(cwd, relativePath);
  const result = await runAtomCommand(appAtomRegistry, projectEnvironment.writeFile, {
    environmentId,
    input: { cwd: root, relativePath: path, contents },
  });
  if (result._tag === "Failure") throw failure(result);
  // A Files tab showing the same file reads it again.
  appAtomRegistry.refresh(getProjectFileQueryAtom(environmentId, root, path));
}
