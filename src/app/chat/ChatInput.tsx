"use client";

import { useRef, useTransition } from "react";
import { sendMessage } from "@/lib/actions";

export function ChatInput() {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const val = ref.current?.value.trim();
    if (!val) return;
    if (ref.current) ref.current.value = "";
    startTransition(async () => {
      await sendMessage(val);
    });
  }

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        placeholder="Say something…"
        disabled={pending}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="flex-1 resize-none rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas transition-colors hover:bg-accent-strong hover:text-ink disabled:opacity-60"
      >
        Send
      </button>
    </form>
  );
}
