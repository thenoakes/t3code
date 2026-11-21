import type { ComponentProps, ReactNode } from "react";
import type { ResizableWidthHandlers } from "~/hooks/useResizableWidth";
import { cn } from "~/lib/utils";

interface Props extends Pick<
  ComponentProps<"div">,
  "tabIndex" | "onKeyDown" | "aria-valuenow" | "aria-valuemin" | "aria-valuemax"
> {
  handlers: ResizableWidthHandlers;
  className?: string;
  label?: string;
  onDoubleClick?: (() => void) | undefined;
  /** Floats on the divider while it or the controls are hovered or focused. */
  children?: ReactNode;
}

export function RightPanelResizeHandle({
  handlers,
  className,
  label,
  onDoubleClick,
  children,
  ...separatorProps
}: Props) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      {...separatorProps}
      className={cn(
        "group absolute inset-y-0 left-0 z-40 w-1 cursor-col-resize touch-none select-none any-pointer-coarse:-left-2 any-pointer-coarse:w-4",
        className,
      )}
      {...handlers}
      onDoubleClick={onDoubleClick}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-px -translate-x-1/2 bg-transparent transition-colors duration-150 group-hover:bg-border group-focus-visible:bg-primary/60 group-active:bg-primary/60 any-pointer-coarse:left-2"
      />
      {children ? (
        <div
          // Pointer and click events stay with the controls, not the drag or double-click.
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          // Just below the title bar, beside the other layout controls.
          className="pointer-events-none absolute top-[calc(var(--workspace-topbar-height)+0.5rem)] left-0 -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-has-focus-visible:pointer-events-auto group-has-focus-visible:opacity-100"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
