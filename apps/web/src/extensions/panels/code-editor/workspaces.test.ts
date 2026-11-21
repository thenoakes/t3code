import { describe, expect, it } from "vite-plus/test";

import {
  isOpenFile,
  locatePath,
  registerOpenFile,
  registerWorkspace,
  workspaceForPath,
} from "./workspaces";
import type { WorkspaceHost } from "./workspaces";

const host = {} as WorkspaceHost;

describe("code editor workspaces", () => {
  it("finds the deepest open workspace for a path, until its editors close", () => {
    const releaseRepo = registerWorkspace("env\u0000/repo", "/repo/", host);
    const releaseWorktree = registerWorkspace(
      "env\u0000/repo/.t3/worktrees/a",
      "/repo/.t3/worktrees/a",
      host,
    );
    const releaseSecond = registerWorkspace("env\u0000/repo", "/repo", host);

    expect(workspaceForPath("/repo/src/index.ts")).toMatchObject({ relativePath: "src/index.ts" });
    expect(workspaceForPath("/repo/.t3/worktrees/a/src/index.ts")).toMatchObject({
      workspace: { root: "/repo/.t3/worktrees/a" },
      relativePath: "src/index.ts",
    });
    expect(workspaceForPath("/repository/src/index.ts")).toBeNull();

    releaseWorktree();
    releaseRepo();
    // Another editor still holds /repo.
    expect(workspaceForPath("/repo/.t3/worktrees/a/src/index.ts")).toMatchObject({
      workspace: { root: "/repo" },
    });
    releaseSecond();
    releaseSecond();
    expect(workspaceForPath("/repo/src/index.ts")).toBeNull();
  });

  it("counts editors per open file", () => {
    const first = registerOpenFile("file:///repo/a.ts");
    const second = registerOpenFile("file:///repo/a.ts");
    first();
    expect(isOpenFile("file:///repo/a.ts")).toBe(true);
    second();
    expect(isOpenFile("file:///repo/a.ts")).toBe(false);
  });

  it("reads paths outside every workspace through the newest one", () => {
    const releaseServer = registerWorkspace(
      "env\u0000/repo/apps/server",
      "/repo/apps/server",
      host,
    );
    const releaseWeb = registerWorkspace("env\u0000/repo/apps/web", "/repo/apps/web", host);
    expect(locatePath("/repo/apps/server/src/a.ts")).toMatchObject({
      workspace: { root: "/repo/apps/server" },
      path: "src/a.ts",
      inWorkspace: true,
    });
    expect(locatePath("/repo/node_modules/effect/src/Effect.ts")).toMatchObject({
      workspace: { root: "/repo/apps/web" },
      path: "/repo/node_modules/effect/src/Effect.ts",
      inWorkspace: false,
    });
    releaseWeb();
    releaseServer();
    expect(locatePath("/repo/node_modules/effect/src/Effect.ts")).toBeNull();
  });
});
