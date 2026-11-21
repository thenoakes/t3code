import type { PanelExtension } from "./types";

// Each folder under ./panels is one extension; its index.tsx default-exports a PanelExtension.
const modules = import.meta.glob<{ default: PanelExtension }>("./panels/*/index.tsx", {
  eager: true,
});

const byId = new Map<string, PanelExtension>();
for (const [path, module] of Object.entries(modules)) {
  const extension = module.default;
  if (!extension || typeof extension.id !== "string") {
    console.warn(`[extensions] ${path} has no default PanelExtension export; skipped.`);
    continue;
  }
  if (byId.has(extension.id)) {
    console.warn(`[extensions] ${path} reuses id "${extension.id}"; skipped.`);
    continue;
  }
  byId.set(extension.id, extension);
}

export const panelExtensions: ReadonlyArray<PanelExtension> = [...byId.values()].toSorted(
  (left, right) => left.title.localeCompare(right.title),
);

export function getPanelExtension(id: string): PanelExtension | undefined {
  return byId.get(id);
}
