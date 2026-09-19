import Link from "next/link";

/** All / TV / Films toggle. A plain link set, so it works without JS. */
export function MediaFilter({
  basePath,
  current,
  counts,
}: {
  basePath: string;
  current: "all" | "tv" | "film";
  counts: { tv: number; film: number };
}) {
  const options = [
    { value: "all", label: "All", n: counts.tv + counts.film },
    { value: "tv", label: "TV", n: counts.tv },
    { value: "film", label: "Films", n: counts.film },
  ] as const;

  return (
    <div className="flex items-center gap-1 rounded-full border border-line p-0.5">
      {options.map((o) => {
        const active = current === o.value;
        return (
          <Link
            key={o.value}
            href={o.value === "all" ? basePath : `${basePath}?type=${o.value}`}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              active ? "bg-accent text-canvas" : "text-ink-muted hover:text-ink"
            }`}
          >
            {o.label}
            <span className={`ml-1.5 font-mono ${active ? "opacity-70" : "text-ink-faint"}`}>
              {o.n}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** Narrow a `?type=` search param to the media types to query. */
export function parseMediaFilter(raw: string | undefined) {
  const current: "all" | "tv" | "film" =
    raw === "tv" || raw === "film" ? raw : "all";
  return {
    current,
    mediaTypes: current === "all" ? undefined : ([current] as ("tv" | "film")[]),
  };
}
