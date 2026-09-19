"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { submitPassword } from "@/lib/actions";

export function LoginForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState(submitPassword, null);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={params.get("next") ?? "/"} />
      <input
        name="password"
        type="password"
        autoFocus
        autoComplete="current-password"
        placeholder="Password"
        aria-label="Password"
        className="w-full rounded-md border border-line bg-surface px-4 py-2.5 text-center text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-2.5 font-medium text-canvas transition-colors hover:bg-accent-strong hover:text-ink disabled:opacity-60"
      >
        {pending ? "…" : "Come in"}
      </button>
      {state?.error && (
        <p className="text-center text-sm text-suzume">{state.error}</p>
      )}
    </form>
  );
}
