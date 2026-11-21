import { Bot } from "lucide-react";
import { lazy } from "react";

import { definePanelExtension } from "../../types";

export default definePanelExtension<null>({
  id: "claude-config",
  title: "Claude config",
  description: "Instructions, skills, agents, commands, hooks and MCP servers in this workspace.",
  icon: Bot,
  shortcut: "C",
  initialState: null,
  component: lazy(() => import("./ClaudeConfigPanel")),
});
