import Link from "next/link";
import { switchUser } from "@/lib/actions";
import type { CurrentUser } from "@/lib/session";
import { SearchBox } from "./SearchBox";
import { WalrusArt } from "./WalrusArt";

const LINKS = [
  { href: "/", label: "Watchlist" },
  { href: "/archive", label: "Archive" },
  { href: "/recommendations", label: "For you" },
];

export function Nav({ user }: { user: CurrentUser | null }) {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" aria-label="tvbox home">
          <WalrusArt className="size-9 text-tobi" title="tvbox" />
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-ink-muted transition-colors hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <SearchBox />
          {user && (
            <form action={switchUser}>
              <button
                type="submit"
                title="Switch person"
                className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ background: user.accentColor }}
                />
                {user.displayName}
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
