import { describe, expect, it } from "vite-plus/test";

import {
  CHAT_PANEL_MIN_WIDTH,
  chatPanelWidth,
  isChatPanelLayout,
  layoutForPanelWidth,
} from "./chatPanelLayout";

const preset = (name: "chat-min" | "even" | "panel-min") =>
  ({ kind: "preset", preset: name }) as const;

describe("chat panel layout", () => {
  it("sizes each preset from the row width", () => {
    expect(chatPanelWidth(preset("chat-min"), 1600)).toBe(1600 - CHAT_PANEL_MIN_WIDTH);
    expect(chatPanelWidth(preset("even"), 1600)).toBe(800);
    expect(chatPanelWidth(preset("panel-min"), 1600)).toBe(CHAT_PANEL_MIN_WIDTH);
  });

  it("keeps both minimums while they fit, and the panel's when they do not", () => {
    expect(chatPanelWidth({ kind: "custom", panelFraction: 0.95 }, 1000)).toBe(640);
    expect(chatPanelWidth({ kind: "custom", panelFraction: 0.05 }, 1000)).toBe(360);
    expect(chatPanelWidth(preset("chat-min"), 600)).toBe(360);
  });

  it("keeps a dragged width as a share of the row", () => {
    const layout = layoutForPanelWidth(500, 1000);
    expect(layout).toEqual({ kind: "custom", panelFraction: 0.5 });
    expect(chatPanelWidth(layout, 2000)).toBe(1000);
  });

  it("recognizes only well-formed saved layouts", () => {
    expect(isChatPanelLayout(preset("even"))).toBe(true);
    expect(isChatPanelLayout({ kind: "custom", panelFraction: 0.3 })).toBe(true);
    expect(isChatPanelLayout({ kind: "preset", preset: "wide" })).toBe(false);
    expect(isChatPanelLayout({ kind: "custom", panelFraction: 2 })).toBe(false);
    expect(isChatPanelLayout(null)).toBe(false);
  });
});
