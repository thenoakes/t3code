import { FileCode2 } from "lucide-react";
import { lazy } from "react";

import { definePanelExtension } from "../../types";

export interface CodeEditorState {
  /** Workspace-relative path of the open file; null until one is chosen. */
  readonly path: string | null;
}

export default definePanelExtension<CodeEditorState>({
  id: "code-editor",
  title: "Code editor",
  description: "Edit a workspace file in Monaco. Experimental.",
  icon: FileCode2,
  shortcut: "E",
  multiple: true,
  initialState: { path: null },
  tabTitle: ({ path }) => (path === null ? null : (path.split("/").at(-1) ?? path)),
  fileHandler: { state: (path) => ({ path }) },
  // Editing keys Monaco binds that the app also binds. Other app shortcuts, such as mod+k and
  // mod+p, run the app command from inside the editor.
  ownShortcuts: [
    "mod+f",
    "mod+d",
    "mod+s",
    "mod+u",
    "mod+[",
    "mod+]",
    "mod+shift+k",
    "mod+shift+l",
    "mod+enter",
    "mod+shift+enter",
  ],
  component: lazy(() => import("./CodeEditorPanel")),
});
