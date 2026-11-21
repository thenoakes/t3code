/** Why closing a surface now would lose work, or null when it can close. */
type CloseGuard = () => string | null;

const guards = new Map<string, CloseGuard>();

const guardKey = (threadKey: string, surfaceId: string) => `${threadKey}\u0000${surfaceId}`;

/**
 * Lets a mounted surface with unsaved work ask before the right panel closes it. `threadKey` is
 * the panel's host thread, as `rightPanelHostRef` resolves it.
 */
export function registerRightPanelCloseGuard(
  threadKey: string,
  surfaceId: string,
  guard: CloseGuard,
): () => void {
  const key = guardKey(threadKey, surfaceId);
  guards.set(key, guard);
  return () => {
    if (guards.get(key) === guard) guards.delete(key);
  };
}

/** Asks once for every closing surface that would lose work; true when they may close. */
export function confirmRightPanelClose(
  threadKey: string,
  surfaceIds: ReadonlyArray<string>,
): boolean {
  const reasons = surfaceIds.flatMap((surfaceId) => {
    const reason = guards.get(guardKey(threadKey, surfaceId))?.();
    return reason ? [reason] : [];
  });
  return reasons.length === 0 || window.confirm(reasons.join("\n\n"));
}
