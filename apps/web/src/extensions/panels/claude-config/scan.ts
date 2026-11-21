import type { PanelEntry, PanelHost } from "../../types";

export interface ConfigItem {
  readonly name: string;
  readonly path: string;
  readonly detail?: string;
  /** Git ignores the file, so it is personal rather than shared with the repository. */
  readonly local?: boolean;
}

export interface ConfigSection {
  readonly id: "instructions" | "skills" | "agents" | "commands" | "settings" | "mcp";
  readonly title: string;
  readonly items: ReadonlyArray<ConfigItem>;
}

type FileHost = Pick<PanelHost, "listDirectory" | "readFile">;

const INSTRUCTION_FILES = ["CLAUDE.md", "CLAUDE.local.md", "AGENTS.md"];
// Keeps a workspace with hundreds of commands from flooding the panel with reads.
const MAX_FILES_PER_SECTION = 100;
const MAX_COMMAND_DEPTH = 3;

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** Reads `key: value` fields, plus `>` and `|` blocks, from a Markdown file's YAML header. */
export function parseFrontmatter(contents: string): Record<string, string> {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(contents)?.[1];
  const fields: Record<string, string> = {};
  if (!header) return fields;
  const lines = header.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const field = /^([\w-]+):[ \t]*(.*)$/.exec(lines[index] ?? "");
    if (!field?.[1]) continue;
    let value = (field[2] ?? "").trim();
    if (/^[>|][+-]?$/.test(value) || value === "") {
      const block: string[] = [];
      while (/^[ \t]+\S/.test(lines[index + 1] ?? "")) block.push((lines[++index] ?? "").trim());
      value = block.join(" ");
    }
    fields[field[1]] = value.replace(/^(["'])(.*)\1$/, "$2");
  }
  return fields;
}

/** The frontmatter description, else the first line of prose. */
function describe(contents: string): string | undefined {
  const description = parseFrontmatter(contents).description;
  if (description) return description;
  const body = contents.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
  return body
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find((line) => line.length > 0);
}

async function listIfPresent(
  host: FileHost,
  entries: ReadonlyArray<PanelEntry>,
  path: string,
): Promise<ReadonlyArray<PanelEntry>> {
  return entries.some((entry) => entry.path === path && entry.kind === "directory")
    ? host.listDirectory(path)
    : [];
}

async function markdownItems(
  host: FileHost,
  files: ReadonlyArray<PanelEntry>,
  nameOf: (entry: PanelEntry) => string,
): Promise<ConfigItem[]> {
  const items = await Promise.all(
    files.slice(0, MAX_FILES_PER_SECTION).map(async (entry) => {
      const file = await host.readFile(entry.path);
      const fields = file ? parseFrontmatter(file.contents) : {};
      const detail = file ? describe(file.contents) : undefined;
      return {
        name: fields.name || nameOf(entry),
        path: entry.path,
        ...(detail ? { detail } : {}),
        ...(entry.ignored ? { local: true } : {}),
      };
    }),
  );
  return items.toSorted((left, right) => left.name.localeCompare(right.name));
}

async function scanSkills(host: FileHost, claude: ReadonlyArray<PanelEntry>) {
  const folders = (await listIfPresent(host, claude, ".claude/skills")).filter(
    (entry) => entry.kind === "directory",
  );
  const withSkillFile = await Promise.all(
    folders.map(async (folder) => {
      const children = await host.listDirectory(folder.path);
      return children.find((child) => baseName(child.path) === "SKILL.md");
    }),
  );
  return markdownItems(
    host,
    withSkillFile.filter((entry) => entry !== undefined),
    (entry) => baseName(entry.path.slice(0, entry.path.lastIndexOf("/"))),
  );
}

async function collectCommands(
  host: FileHost,
  directory: string,
  depth: number,
): Promise<PanelEntry[]> {
  const entries = await host.listDirectory(directory);
  const nested =
    depth < MAX_COMMAND_DEPTH
      ? await Promise.all(
          entries
            .filter((entry) => entry.kind === "directory")
            .map((entry) => collectCommands(host, entry.path, depth + 1)),
        )
      : [];
  return [
    ...entries.filter((entry) => entry.kind === "file" && entry.path.endsWith(".md")),
    ...nested.flat(),
  ];
}

async function scanCommands(host: FileHost, claude: ReadonlyArray<PanelEntry>) {
  if (!claude.some((entry) => entry.path === ".claude/commands" && entry.kind === "directory"))
    return [];
  const files = await collectCommands(host, ".claude/commands", 1);
  // Claude names a nested command by its folders: commands/git/sync.md is /git:sync.
  return markdownItems(
    host,
    files,
    (entry) =>
      `/${entry.path.slice(".claude/commands/".length, -".md".length).replaceAll("/", ":")}`,
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseJson(contents: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(contents));
  } catch {
    return undefined;
  }
}

function summarizeSettings(contents: string): string {
  const settings = parseJson(contents);
  if (!settings) return "Not valid JSON";
  const parts: string[] = [];
  const hooks = Object.keys(asRecord(settings.hooks) ?? {});
  if (hooks.length > 0) parts.push(`Hooks: ${hooks.join(", ")}`);
  const permissions = asRecord(settings.permissions);
  for (const rule of ["allow", "ask", "deny"]) {
    const rules = permissions?.[rule];
    if (Array.isArray(rules) && rules.length > 0) parts.push(`${rules.length} ${rule}`);
  }
  const env = Object.keys(asRecord(settings.env) ?? {});
  if (env.length > 0) parts.push(`Env: ${env.join(", ")}`);
  const other = Object.keys(settings).filter(
    (key) => !["hooks", "permissions", "env", "$schema"].includes(key),
  );
  if (other.length > 0) parts.push(`Also: ${other.join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : "Empty";
}

async function scanSettings(host: FileHost, claude: ReadonlyArray<PanelEntry>) {
  const files = claude.filter(
    (entry) =>
      entry.kind === "file" &&
      ["settings.json", "settings.local.json"].includes(baseName(entry.path)),
  );
  return Promise.all(
    files.map(async (entry) => {
      const file = await host.readFile(entry.path);
      return {
        name: baseName(entry.path),
        path: entry.path,
        detail: file ? summarizeSettings(file.contents) : "Missing",
        ...(entry.ignored ? { local: true } : {}),
      };
    }),
  );
}

async function scanMcp(host: FileHost, root: ReadonlyArray<PanelEntry>): Promise<ConfigItem[]> {
  if (!root.some((entry) => entry.path === ".mcp.json" && entry.kind === "file")) return [];
  const file = await host.readFile(".mcp.json");
  const config = file ? parseJson(file.contents) : undefined;
  if (!config) return [{ name: ".mcp.json", path: ".mcp.json", detail: "Not valid JSON" }];
  return Object.entries(asRecord(config.mcpServers) ?? {}).map(([name, value]) => {
    const server = asRecord(value);
    const command = typeof server?.command === "string" ? server.command : undefined;
    const args = Array.isArray(server?.args) ? server.args.join(" ") : "";
    const url = typeof server?.url === "string" ? server.url : undefined;
    const detail = command ? `${command} ${args}`.trim() : url;
    return { name, path: ".mcp.json", ...(detail ? { detail } : {}) };
  });
}

/** Finds the project-level Claude Code files in the thread's workspace. */
export async function scanClaudeConfig(host: FileHost): Promise<ConfigSection[]> {
  const root = await host.listDirectory("");
  const claude = await listIfPresent(host, root, ".claude");
  const instructionFiles = [
    ...root.filter(
      (entry) => entry.kind === "file" && INSTRUCTION_FILES.includes(baseName(entry.path)),
    ),
    ...claude.filter((entry) => entry.path === ".claude/CLAUDE.md"),
  ];
  const [instructions, skills, agents, commands, settings, mcp] = await Promise.all([
    markdownItems(host, instructionFiles, (entry) => entry.path),
    scanSkills(host, claude),
    listIfPresent(host, claude, ".claude/agents").then((entries) =>
      markdownItems(
        host,
        entries.filter((entry) => entry.kind === "file" && entry.path.endsWith(".md")),
        (entry) => baseName(entry.path).slice(0, -".md".length),
      ),
    ),
    scanCommands(host, claude),
    scanSettings(host, claude),
    scanMcp(host, root),
  ]);
  return [
    // Show instruction files by path, ignoring any frontmatter name.
    {
      id: "instructions",
      title: "Instructions",
      items: instructions.map((item) => ({ ...item, name: item.path })),
    },
    { id: "skills", title: "Skills", items: skills },
    { id: "agents", title: "Agents", items: agents },
    { id: "commands", title: "Commands", items: commands },
    { id: "settings", title: "Settings and hooks", items: settings },
    { id: "mcp", title: "MCP servers", items: mcp },
  ];
}
