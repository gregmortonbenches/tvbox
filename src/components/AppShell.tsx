import { Suspense } from "react";
import { LiveRefresh } from "./LiveRefresh";
import { Nav } from "./Nav";
import type { CurrentUser } from "@/lib/session";

export function AppShell({
  user,
  children,
}: {
  user: CurrentUser | null;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Nav reads searchParams via SearchBox, so it needs a Suspense
          boundary or the whole route opts out of static rendering. */}
      <Suspense fallback={<div className="h-14 border-b border-line" />}>
        <Nav user={user} />
      </Suspense>
      <LiveRefresh />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <Footer />
    </>
  );
}

/*
 * The walrus credit is a licence condition, not decoration: Noun Project's
 * free tier is CC BY. Don't remove it unless the icon gets swapped for
 * something differently licensed (or a paid Noun Project licence is bought).
 */
function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-ink-faint">
      <p>
        Show data from{" "}
        <a
          href="https://www.themoviedb.org/"
          className="hover:text-ink-muted"
          target="_blank"
          rel="noreferrer"
        >
          TMDB
        </a>
        . Walrus by Lewen Design from{" "}
        <a
          href="https://thenounproject.com/"
          className="hover:text-ink-muted"
          target="_blank"
          rel="noreferrer"
        >
          Noun Project
        </a>
        {" "}(CC BY).
      </p>
    </footer>
  );
}

export function PageHeading({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 border-b border-line pb-3">
      <h1 className="flex items-baseline gap-2.5 text-xl font-bold tracking-tight">
        {title}
        {count !== undefined && (
          <span className="font-mono text-sm font-normal text-ink-faint">{count}</span>
        )}
      </h1>
      {children}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center">
      <p className="text-ink-muted">{title}</p>
      <p className="mt-1 text-sm text-ink-faint">{hint}</p>
    </div>
  );
}
