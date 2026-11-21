# Panel extensions

A panel extension is a right panel tab built against a small contract, so it can be written
outside this app and dropped in.

## Adding one

1. Create `panels/<id>/index.tsx`.
2. Default-export `definePanelExtension({...})` from it.

The registry discovers the folder at build time. No other file changes. In dev, Vite hot-reloads
the panel, and since everything here is web code, editing it never restarts the server.

```tsx
import { Sparkles } from "lucide-react";
import { lazy } from "react";
import { definePanelExtension } from "../../types";

export default definePanelExtension<{ count: number }>({
  id: "counter",
  title: "Counter",
  icon: Sparkles,
  initialState: { count: 0 },
  component: lazy(() => import("./CounterPanel")),
});
```

Working examples:

- `panels/notes` keeps scratch notes per thread and sends them to the composer.
- `panels/code-editor` edits a file in Monaco, following changes the agent makes to it.
- `panels/claude-config` reads the workspace to list Claude Code files: instructions, skills,
  agents, commands, settings and hooks, and MCP servers.

## The contract

All of it is in [`types.ts`](./types.ts). Import only from there, plus React and UI primitives
under `~/components/ui`. If a panel needs something the host does not offer, add it to
`PanelHost` rather than importing app stores, so panels survive upstream refactors.

- `PanelExtension`: the extension's id, title, icon, and optional add-menu shortcut letter.
  Set `multiple` if each open should make a new tab. Optional extras:
  - `tabTitle` names a tab from its state, such as the open file.
  - `fileHandler` adds "Open in <title>" to the Files tab header.
  - `ownShortcuts` lists app shortcuts the panel keeps while focused. Every other app shortcut
    runs the app command, even inside a widget such as an embedded editor that would consume it.
- `PanelProps`: what the panel receives: the thread, its environment, the workspace root,
  `visible`, `appearance`, `workspaceRevision` (changes when the agent may have edited files),
  the tab's `state`, and `host`.
- `PanelHost`: what the panel can ask of the app:
  - `setState` saves the tab's state.
  - `insertIntoComposer` adds text to the composer.
  - `openFile` opens a workspace file.
  - `listDirectory`, `readFile` and `writeFile` use the thread's workspace. They take workspace-relative paths
    only and reject anything that leaves the workspace, such as `~/.claude`.
  - `openPanel` opens an extension panel, optionally with a starting state.
  - `close` closes the tab.
  - `setCloseWarning` makes closing the tab ask first, while the panel holds unsaved work.

## Rules

- State is persisted per tab in browser storage, so keep it small and JSON-safe. Debounce or
  write on blur rather than on every keystroke.
- Pause polling and animation while `visible` is false.
- A panel that throws shows an error in its own tab. One that is no longer installed shows
  "Panel not installed" until the user closes the tab.
- Extensions are trusted code with full app privileges. Review one before dropping it in.
- Extensions are web and desktop only. The mobile app does not load them.
