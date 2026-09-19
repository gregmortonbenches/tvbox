"use client";

import { useTransition } from "react";
import { dismissRecommendation } from "@/lib/actions";

export function DismissButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => dismissRecommendation(id).then(() => {}))}
      className="text-xs text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline disabled:opacity-60"
    >
      Not for us
    </button>
  );
}
