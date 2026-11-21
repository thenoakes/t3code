import { describe, expect, it } from "vite-plus/test";

import type { PanelEntry, PanelFile } from "../../types";
import { parseFrontmatter, scanClaudeConfig } from "./scan";

function workspace(files: Record<string, string>, ignored: ReadonlyArray<string> = []) {
  const entries = new Map<string, PanelEntry>();
  for (const path of Object.keys(files)) {
    const segments = path.split("/");
    segments.forEach((_, index) => {
      const entryPath = segments.slice(0, index + 1).join("/");
      entries.set(entryPath, {
        path: entryPath,
        kind: index === segments.length - 1 ? "file" : "directory",
        ignored: ignored.includes(entryPath),
      });
    });
  }
  return {
    listDirectory: async (directory: string) =>
      [...entries.values()].filter(
        (entry) => entry.path.slice(0, Math.max(0, entry.path.lastIndexOf("/"))) === directory,
      ),
    readFile: async (path: string): Promise<PanelFile | null> =>
      path in files ? { path, contents: files[path] ?? "", truncated: false } : null,
  };
}

describe("parseFrontmatter", () => {
  it("reads plain, quoted and folded fields", () => {
    expect(
      parseFrontmatter(
        [
          "---",
          "name: review",
          'model: "opus"',
          "description: >",
          "  Reviews a",
          "  diff.",
          "---",
          "Body",
        ].join("\n"),
      ),
    ).toEqual({ name: "review", model: "opus", description: "Reviews a diff." });
    expect(parseFrontmatter("# No header")).toEqual({});
  });
});

describe("scanClaudeConfig", () => {
  it("finds each kind of project Claude file", async () => {
    const sections = await scanClaudeConfig(
      workspace(
        {
          "CLAUDE.md": "@AGENTS.md",
          "AGENTS.md": "# Agent rules\nMore.",
          "src/index.ts": "",
          ".claude/skills/deploy/SKILL.md": "---\nname: deploy\ndescription: Ships it.\n---\n",
          ".claude/skills/empty/notes.md": "",
          ".claude/agents/reviewer.md": "---\ndescription: Reviews diffs.\n---\n",
          ".claude/commands/git/sync.md": "Sync with main.",
          ".claude/settings.json": JSON.stringify({
            hooks: { PreToolUse: [] },
            permissions: { allow: ["Bash"] },
          }),
          ".claude/settings.local.json": "{",
          ".mcp.json": JSON.stringify({
            mcpServers: { docs: { command: "npx", args: ["docs-mcp"] } },
          }),
        },
        [".claude/settings.local.json"],
      ),
    );
    const byId = Object.fromEntries(sections.map((section) => [section.id, section.items]));

    expect(byId.instructions?.map((item) => [item.name, item.detail])).toEqual([
      ["AGENTS.md", "Agent rules"],
      ["CLAUDE.md", "@AGENTS.md"],
    ]);
    expect(byId.skills).toEqual([
      { name: "deploy", path: ".claude/skills/deploy/SKILL.md", detail: "Ships it." },
    ]);
    expect(byId.agents?.map((item) => [item.name, item.detail])).toEqual([
      ["reviewer", "Reviews diffs."],
    ]);
    expect(byId.commands?.map((item) => item.name)).toEqual(["/git:sync"]);
    expect(byId.settings).toEqual([
      {
        name: "settings.json",
        path: ".claude/settings.json",
        detail: "Hooks: PreToolUse · 1 allow",
      },
      {
        name: "settings.local.json",
        path: ".claude/settings.local.json",
        detail: "Not valid JSON",
        local: true,
      },
    ]);
    expect(byId.mcp).toEqual([{ name: "docs", path: ".mcp.json", detail: "npx docs-mcp" }]);
  });

  it("returns empty sections for a workspace without Claude files", async () => {
    const sections = await scanClaudeConfig(workspace({ "README.md": "" }));
    expect(sections.every((section) => section.items.length === 0)).toBe(true);
  });
});
