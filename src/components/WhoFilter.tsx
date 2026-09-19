import Link from "next/link";
import type { CurrentUser } from "@/lib/session";

/*
 * Whose watchlist to show. "Everyone" is everything; picking a person shows
 * what THEY can watch — things you both want, plus their solo entries. It
 * deliberately does not mean "only their solo picks", which would be a much
 * less useful list.
 */
export function WhoFilter({
  basePath,
  current,
  people,
  extraParams = {},
}: {
  basePath: string;
  current: string | null;
  people: CurrentUser[];
  extraParams?: Record<string, string | undefined>;
}) {
  function href(who?: string) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) if (v) params.set(k, v);
    if (who) params.set("who", who);
    const q = params.toString();
    return q ? `${basePath}?${q}` : basePath;
  }

  return (
    <div className="flex items-center gap-1 rounded-full border border-line p-0.5">
      <Link
        href={href()}
        className={`rounded-full px-3 py-1 text-xs transition-colors ${
          current === null ? "bg-accent text-canvas" : "text-ink-muted hover:text-ink"
        }`}
      >
        Everyone
      </Link>
      {people.map((p) => {
        const active = current === p.username;
        return (
          <Link
            key={p.id}
            href={href(p.username)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              active ? "text-canvas" : "text-ink-muted hover:text-ink"
            }`}
            style={active ? { background: p.accentColor } : undefined}
          >
            {p.displayName}
          </Link>
        );
      })}
    </div>
  );
}
