import { useState } from "react";

import { Button } from "~/components/ui/button";
import type { PanelProps } from "../../types";
import type { NotesState } from "./index";

export default function NotesPanel({ state, host, thread }: PanelProps<NotesState>) {
  // Typing stays local; the tab's persisted state is written when focus leaves.
  const [text, setText] = useState(state.text);
  const commit = () => {
    if (text !== state.text) host.setState({ text });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className="truncate text-muted-foreground text-xs">
        {thread ? `Notes for ${thread.title}` : "Notes"}
      </div>
      <textarea
        className="min-h-0 flex-1 resize-none rounded-md border border-input bg-transparent p-2 font-mono text-sm outline-none focus-visible:border-ring"
        placeholder="Jot things down. They stay with this thread."
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
      />
      <div className="flex justify-end gap-2">
        <Button
          size="compact"
          variant="ghost"
          disabled={text.length === 0}
          onClick={() => {
            setText("");
            host.setState({ text: "" });
          }}
        >
          Clear
        </Button>
        <Button
          size="compact"
          disabled={text.trim().length === 0}
          onClick={() => {
            commit();
            host.insertIntoComposer(text);
          }}
        >
          Send to composer
        </Button>
      </div>
    </div>
  );
}
