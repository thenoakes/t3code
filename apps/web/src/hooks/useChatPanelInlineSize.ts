import { useLayoutEffect, useState, type ReactNode } from "react";

import {
  CHAT_PANEL_MIN_WIDTH,
  type ChatPanelLayout,
  chatPanelWidth,
  layoutForPanelWidth,
} from "../chatPanelLayout";
import { observeResize } from "../lib/observeResize";
import type { PreviewPanelInlineSize } from "./usePreviewPanelInlineSize";
import { RESIZABLE_WIDTH_PROPERTY } from "./useResizableWidth";
import { useResizeDrag } from "./useResizeDrag";

/**
 * The chat thread's side panel width, from its layout and the row it shares with the chat. A
 * drag leaves a custom split through `onLayoutChange`; the width follows the pointer every frame
 * and the layout is written once, on release.
 */
export function useChatPanelInlineSize(options: {
  readonly container: HTMLElement | null;
  readonly layout: ChatPanelLayout;
  readonly onLayoutChange: (layout: ChatPanelLayout) => void;
  readonly onDividerDoubleClick: () => void;
  readonly dividerControls: ReactNode;
}): PreviewPanelInlineSize {
  const { container, layout, onLayoutChange } = options;
  const [rowWidth, setRowWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  const width = chatPanelWidth(layout, rowWidth);
  const maxWidth = Math.max(CHAT_PANEL_MIN_WIDTH, Math.floor(rowWidth) - CHAT_PANEL_MIN_WIDTH);

  const drag = useResizeDrag<HTMLElement>((event) => {
    const host = event.currentTarget.parentElement;
    // Disable drag transitions through transition-property; the host renders transition-duration.
    host?.style.setProperty("transition-property", "none");
    const startRowWidth = rowWidth;
    const startWidth = width;
    return {
      width: startWidth,
      edge: "left",
      bounds: { min: CHAT_PANEL_MIN_WIDTH, max: maxWidth },
      resize(nextWidth) {
        host?.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${nextWidth}px`);
        return nextWidth;
      },
      finish(finalWidth, moved) {
        if (moved) onLayoutChange(layoutForPanelWidth(finalWidth, startRowWidth));
        else host?.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${startWidth}px`);
      },
      cleanup(committed) {
        host?.style.removeProperty("transition-property");
        if (!committed) host?.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${startWidth}px`);
      },
    };
  });
  // A window resized mid-drag moves the bounds; re-apply the live pointer position to them.
  const { refresh } = drag;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reapplies the live drag pointer position to the DOM before paint when the bounds change
  useLayoutEffect(() => refresh({ min: CHAT_PANEL_MIN_WIDTH, max: maxWidth }), [refresh, maxWidth]);

  const observeRow = (host: HTMLElement) => {
    const row = container ?? host.parentElement;
    const measure = () => {
      if (row) setRowWidth(row.clientWidth);
    };
    measure();
    return row ? observeResize(row, measure) : () => undefined;
  };

  return {
    width,
    handlers: {
      ref: drag.ref,
      onPointerDown: drag.onPointerDown,
      onPointerMove: drag.onPointerMove,
      onPointerUp: drag.onPointerUp,
      onPointerCancel: drag.onPointerCancel,
      onLostPointerCapture: drag.onLostPointerCapture,
    },
    observeRow,
    onDividerDoubleClick: options.onDividerDoubleClick,
    dividerControls: options.dividerControls,
  };
}
