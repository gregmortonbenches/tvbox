"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search shows…"
        aria-label="Search shows"
        className="w-40 rounded-full border border-line bg-surface px-4 py-1.5 text-sm text-ink placeholder:text-ink-faint transition-[width,border-color] focus:w-56 focus:border-accent focus:outline-none"
      />
    </form>
  );
}
