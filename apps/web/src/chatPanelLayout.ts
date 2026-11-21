/** The narrowest either the chat column or the side panel may be. */
export const CHAT_PANEL_MIN_WIDTH = 360;

export type ChatPanelPreset = "chat-min" | "even" | "panel-min";

/** How a thread splits its width between the chat and the side panel. */
export type ChatPanelLayout =
  | { readonly kind: "preset"; readonly preset: ChatPanelPreset }
  // A dragged divider, kept as the panel's share so it scales with the window.
  | { readonly kind: "custom"; readonly panelFraction: number };

export type ChatPanelFullscreen = "chat" | "panel";

export const DEFAULT_CHAT_PANEL_LAYOUT: ChatPanelLayout = { kind: "preset", preset: "even" };

const CHAT_PANEL_PRESETS: ReadonlyArray<ChatPanelPreset> = ["chat-min", "even", "panel-min"];

/** The side panel's width in a row this wide; both sides keep their minimum while they fit. */
export function chatPanelWidth(layout: ChatPanelLayout, rowWidth: number): number {
  const max = Math.max(CHAT_PANEL_MIN_WIDTH, Math.floor(rowWidth) - CHAT_PANEL_MIN_WIDTH);
  const wanted =
    layout.kind === "custom"
      ? rowWidth * layout.panelFraction
      : layout.preset === "chat-min"
        ? rowWidth - CHAT_PANEL_MIN_WIDTH
        : layout.preset === "panel-min"
          ? CHAT_PANEL_MIN_WIDTH
          : rowWidth / 2;
  return Math.round(Math.max(CHAT_PANEL_MIN_WIDTH, Math.min(max, wanted)));
}

/** The layout a divider dragged to `panelWidth` leaves. */
export function layoutForPanelWidth(panelWidth: number, rowWidth: number): ChatPanelLayout {
  if (rowWidth <= 0) return DEFAULT_CHAT_PANEL_LAYOUT;
  return { kind: "custom", panelFraction: Math.min(1, Math.max(0, panelWidth / rowWidth)) };
}

export function isChatPanelLayout(value: unknown): value is ChatPanelLayout {
  if (typeof value !== "object" || value === null) return false;
  const layout = value as { kind?: unknown; preset?: unknown; panelFraction?: unknown };
  return layout.kind === "preset"
    ? CHAT_PANEL_PRESETS.includes(layout.preset as ChatPanelPreset)
    : layout.kind === "custom" &&
        typeof layout.panelFraction === "number" &&
        Number.isFinite(layout.panelFraction) &&
        layout.panelFraction >= 0 &&
        layout.panelFraction <= 1;
}
