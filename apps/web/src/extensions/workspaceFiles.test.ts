import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { listWorkspaceDirectory, readWorkspaceFile } from "./workspaceFiles";

const environmentId = EnvironmentId.make("environment-local");

describe("workspace file access for panels", () => {
  it("rejects paths outside the workspace before any request", async () => {
    for (const path of [
      "/etc/passwd",
      "~/.claude/settings.json",
      "C:/Windows",
      "../secret",
      "a/../../b",
    ]) {
      await expect(readWorkspaceFile(environmentId, "/repo", path)).rejects.toThrow(
        "is outside the workspace",
      );
    }
    await expect(listWorkspaceDirectory(environmentId, "/repo", "..")).rejects.toThrow(
      "is outside the workspace",
    );
  });

  it("rejects when the thread has no workspace", async () => {
    await expect(readWorkspaceFile(environmentId, undefined, "CLAUDE.md")).rejects.toThrow(
      "no workspace",
    );
  });
});
