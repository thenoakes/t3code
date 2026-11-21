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

`panels/notes` is a working example.

## The contract

All of it is in [`types.ts`](./types.ts). Import only from there, plus React and UI primitives
under `~/components/ui`. If a panel needs something the host does not offer, add it to
`PanelHost` rather than importing app stores, so panels survive upstream refactors.

- `PanelExtension`: the extension's id, title, icon, and optional add-menu shortcut letter.
  Set `multiple` if each open should make a new tab.
- `PanelProps`: what the panel receives: the thread, its environment, the workspace root,
  `visible`, the tab's `state`, and `host`.
- `PanelHost`: what the panel can ask of the app:
  - `setState` saves the tab's state.
  - `insertIntoComposer` adds text to the composer.
  - `openFile` opens a workspace file.
  - `openPanel` opens another extension panel.
  - `close` closes the tab.

## Rules

- State is persisted per tab in browser storage, so keep it small and JSON-safe. Debounce or
  write on blur rather than on every keystroke.
- Pause polling and animation while `visible` is false.
- A panel that throws shows an error in its own tab. One that is no longer installed shows
  "Panel not installed" until the user closes the tab.
- Extensions are trusted code with full app privileges. Review one before dropping it in.
- Extensions are web and desktop only. The mobile app does not load them.
