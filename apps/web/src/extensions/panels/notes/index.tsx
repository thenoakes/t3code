import { NotebookPen } from "lucide-react";
import { lazy } from "react";

import { definePanelExtension } from "../../types";

export interface NotesState {
  readonly text: string;
}

export default definePanelExtension<NotesState>({
  id: "notes",
  title: "Notes",
  description: "Scratch notes kept with this thread.",
  icon: NotebookPen,
  shortcut: "N",
  initialState: { text: "" },
  component: lazy(() => import("./NotesPanel")),
});
