import type { ChatPanelLayout, ChatPanelPreset } from "../../chatPanelLayout";
import { useChatPanelInlineSize } from "../../hooks/useChatPanelInlineSize";
import { RightPanelTabs, type RightPanelTabsProps } from "../RightPanelTabs";
import { ChatPanelDividerControls } from "./ChatPanelDividerControls";

type ChatRightPanelProps = Omit<
  RightPanelTabsProps,
  "mode" | "inlineSize" | "maximized" | "layoutControls"
> & {
  readonly maximized: boolean;
  readonly workspaceLayoutElement: HTMLElement | null;
  readonly layout: ChatPanelLayout;
  readonly onLayoutChange: (layout: ChatPanelLayout) => void;
  readonly onPreset: (preset: ChatPanelPreset) => void;
  readonly onFullscreen: (side: "chat" | "panel") => void;
};

/**
 * The right panel beside the chat column. Its width follows the thread's layout, and a divider
 * drag every frame, so the width state lives here rather than in ChatView.
 */
export function ChatRightPanel(props: ChatRightPanelProps) {
  const {
    workspaceLayoutElement,
    maximized,
    layout,
    onLayoutChange,
    onPreset,
    onFullscreen,
    ...tabs
  } = props;
  const inlineSize = useChatPanelInlineSize({
    container: workspaceLayoutElement,
    layout,
    onLayoutChange,
    onDividerDoubleClick: () => onPreset("even"),
    dividerControls: (
      <ChatPanelDividerControls layout={layout} onPreset={onPreset} onFullscreen={onFullscreen} />
    ),
  });
  return <RightPanelTabs {...tabs} mode="inline" maximized={maximized} inlineSize={inlineSize} />;
}
