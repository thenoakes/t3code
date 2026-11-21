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
  component: lazy(() => import("./CodeEditorPanel")),
});
