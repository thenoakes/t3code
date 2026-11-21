import { useGT } from "gt-react";
import {
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  Columns2Icon,
  PanelLeftIcon,
  PanelRightIcon,
} from "lucide-react";
import type { ComponentType } from "react";

import type { ChatPanelLayout, ChatPanelPreset } from "../../chatPanelLayout";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

function DividerButton(props: {
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly active?: boolean;
  readonly onPress: () => void;
}) {
  const Icon = props.icon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant={props.active ? "secondary" : "ghost"}
            aria-label={props.label}
            aria-pressed={props.active}
            onClick={props.onPress}
          >
            <Icon className="size-3.5" />
          </Button>
        }
      />
      <TooltipPopup side="right">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

/** Layout presets and fullscreen, floating on the divider between the chat and the panel. */
export function ChatPanelDividerControls(props: {
  readonly layout: ChatPanelLayout;
  readonly onPreset: (preset: ChatPanelPreset) => void;
  readonly onFullscreen: (side: "chat" | "panel") => void;
}) {
  const gt = useGT();
  const preset = props.layout.kind === "preset" ? props.layout.preset : null;
  return (
    <div
      className="flex cursor-default flex-col items-center gap-0.5 rounded-full border border-border bg-popover p-0.5 shadow-md"
      data-chat-panel-divider-controls
    >
      <DividerButton
        label={gt("Fullscreen chat")}
        icon={ArrowRightToLineIcon}
        onPress={() => props.onFullscreen("chat")}
      />
      <div aria-hidden className="h-px w-4 bg-border" />
      <DividerButton
        label={gt("Narrow chat")}
        icon={PanelLeftIcon}
        active={preset === "chat-min"}
        onPress={() => props.onPreset("chat-min")}
      />
      <DividerButton
        label={gt("Even split")}
        icon={Columns2Icon}
        active={preset === "even"}
        onPress={() => props.onPreset("even")}
      />
      <DividerButton
        label={gt("Narrow panel")}
        icon={PanelRightIcon}
        active={preset === "panel-min"}
        onPress={() => props.onPreset("panel-min")}
      />
      <div aria-hidden className="h-px w-4 bg-border" />
      <DividerButton
        label={gt("Fullscreen panel")}
        icon={ArrowLeftToLineIcon}
        onPress={() => props.onFullscreen("panel")}
      />
    </div>
  );
}
