import { RefreshCw } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";

import { Button } from "~/components/ui/button";
import type { PanelProps } from "../../types";
import { type ConfigSection, scanClaudeConfig } from "./scan";

export default function ClaudeConfigPanel({ host, visible, workspaceRoot }: PanelProps<null>) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly sections: ReadonlyArray<ConfigSection> | null;
    readonly error: string | null;
  } | null>(null);
  const key = `${workspaceRoot ?? ""}\n${revision}`;
  const loading = workspaceRoot !== undefined && result?.key !== key;
  const sections = result?.sections ?? null;
  const error = result?.key === key ? result.error : null;

  const scan = useEffectEvent((scanKey: string) => {
    let cancelled = false;
    scanClaudeConfig(host)
      .then((next) => {
        if (!cancelled) setResult({ key: scanKey, sections: next, error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setResult((previous) => ({
          key: scanKey,
          sections: previous?.sections ?? null,
          error: message,
        }));
      });
    return () => {
      cancelled = true;
    };
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the workspace once per root or rescan while shown, and drops a scan the tab moved on from
  useEffect(() => {
    if (!visible || !workspaceRoot) return;
    return scan(key);
  }, [visible, workspaceRoot, key]);

  if (!workspaceRoot) {
    return <div className="p-3 text-muted-foreground text-sm">This thread has no workspace.</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1 truncate font-mono text-muted-foreground text-xs">
          {workspaceRoot}
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Rescan"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw className={loading ? "animate-spin" : undefined} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error ? <div className="mb-3 text-destructive-foreground text-sm">{error}</div> : null}
        {sections === null ? (
          loading ? (
            <div className="text-muted-foreground text-sm">Scanning…</div>
          ) : null
        ) : (
          <div className="flex flex-col gap-4">
            {sections.map((section) => (
              <section key={section.id} className="flex flex-col gap-1">
                <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {section.title}
                  <span className="ml-1.5 tabular-nums">{section.items.length}</span>
                </h3>
                {section.items.length === 0 ? (
                  <div className="text-muted-foreground/70 text-xs">None</div>
                ) : (
                  section.items.map((item) => (
                    <button
                      key={`${item.path}:${item.name}`}
                      type="button"
                      className="flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                      onClick={() => host.openFile(item.path)}
                    >
                      <span className="flex w-full min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium text-sm">{item.name}</span>
                        {item.local ? (
                          <span className="shrink-0 rounded border px-1 text-3xs text-muted-foreground">
                            local
                          </span>
                        ) : null}
                      </span>
                      <span className="max-w-full truncate font-mono text-3xs text-muted-foreground/70">
                        {item.path}
                      </span>
                      {item.detail ? (
                        <span className="line-clamp-2 text-muted-foreground text-xs">
                          {item.detail}
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
