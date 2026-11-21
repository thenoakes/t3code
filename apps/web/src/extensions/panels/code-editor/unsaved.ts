import type { CodeEditorState } from "./index";

// Larger edits are not kept with the tab, which lives in browser storage; the close prompt still
// guards them while the editor is mounted.
const MAX_KEPT_UNSAVED_LENGTH = 1_000_000;

/** FNV-1a over UTF-16 code units: enough to tell whether the file changed since an edit began. */
export function contentHash(text: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * What the editor opens with: the tab's kept edits when they differ from the file, and the disk
 * text to offer in the conflict banner when the file changed since those edits began.
 */
export function restoreUnsaved(
  state: CodeEditorState,
  filePath: string,
  diskText: string,
): { readonly text: string; readonly dirty: boolean; readonly conflictDiskText: string | null } {
  const kept = state.path === filePath ? state.unsaved : undefined;
  if (kept === undefined || kept.text === diskText) {
    return { text: diskText, dirty: false, conflictDiskText: null };
  }
  return {
    text: kept.text,
    dirty: true,
    conflictDiskText: kept.baseHash === contentHash(diskText) ? null : diskText,
  };
}

/**
 * The tab's state for the editor's current text, or null when it already holds it. `savedText`
 * is the file text the edits are compared against.
 */
export function nextUnsavedState(
  state: CodeEditorState,
  filePath: string,
  text: string,
  savedText: string,
): CodeEditorState | null {
  // A tab moved on to another file keeps that file's state.
  if (state.path !== filePath) return null;
  const unsaved =
    text !== savedText && text.length <= MAX_KEPT_UNSAVED_LENGTH
      ? { text, baseHash: contentHash(savedText) }
      : undefined;
  if (unsaved?.text === state.unsaved?.text && unsaved?.baseHash === state.unsaved?.baseHash) {
    return null;
  }
  return unsaved ? { path: filePath, unsaved } : { path: filePath };
}
