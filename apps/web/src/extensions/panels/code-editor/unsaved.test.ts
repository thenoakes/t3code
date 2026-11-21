import { describe, expect, it } from "vite-plus/test";

import { contentHash, nextUnsavedState, restoreUnsaved } from "./unsaved";

describe("code editor unsaved edits", () => {
  it("keeps edits with the tab and clears them once saved", () => {
    const kept = nextUnsavedState({ path: "a.ts" }, "a.ts", "edited", "disk");
    expect(kept).toEqual({
      path: "a.ts",
      unsaved: { text: "edited", baseHash: contentHash("disk") },
    });
    expect(nextUnsavedState(kept!, "a.ts", "edited", "disk")).toBeNull();
    expect(nextUnsavedState(kept!, "a.ts", "edited", "edited")).toEqual({ path: "a.ts" });
    // The tab now shows another file, so the old editor's edits are not written over it.
    expect(nextUnsavedState({ path: "b.ts" }, "a.ts", "edited", "disk")).toBeNull();
  });

  it("restores kept edits, and flags a file changed since they began", () => {
    const state = { path: "a.ts", unsaved: { text: "edited", baseHash: contentHash("disk") } };
    expect(restoreUnsaved(state, "a.ts", "disk")).toEqual({
      text: "edited",
      dirty: true,
      conflictDiskText: null,
    });
    expect(restoreUnsaved(state, "a.ts", "agent changed it")).toEqual({
      text: "edited",
      dirty: true,
      conflictDiskText: "agent changed it",
    });
    // The disk already holds the edits, or the tab holds none.
    expect(restoreUnsaved(state, "a.ts", "edited")).toEqual({
      text: "edited",
      dirty: false,
      conflictDiskText: null,
    });
    expect(restoreUnsaved({ path: "a.ts" }, "a.ts", "disk").dirty).toBe(false);
  });
});
