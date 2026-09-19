import Image from "next/image";
import Link from "next/link";
import { AppShell, PageHeading } from "@/components/AppShell";
import { AddButton } from "@/components/AddButton";
import { DismissButton } from "@/components/DismissButton";
import { RefreshRecommendations } from "@/components/RefreshRecommendations";
import { getRecommendations } from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";
import { posterUrl } from "@/lib/tmdb";
import { titleHref } from "@/lib/queries";

const SOURCE_LABEL: Record<string, string> = {
  claude: "suggested by Claude",
  tmdb_similar: "similar to what you liked",
  manual: "added by hand",
};

export default async function RecommendationsPage() {
  const [user, recs] = await Promise.all([getCurrentUser(), getRecommendations()]);

  return (
    <AppShell user={user}>
      <PageHeading title="For you" count={recs.length}>
        <RefreshRecommendations />
      </PageHeading>

      {recs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center">
          <p className="text-ink-muted">No suggestions yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-faint">
            Press <span className="text-accent">Find something</span> above and I&rsquo;ll
            have a look at what you&rsquo;ve rated.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {recs.map((rec) => {
            const poster = posterUrl(rec.posterPath, "w342");
            const href = titleHref(rec.mediaType, rec.tmdbId);
            return (
              <li
                key={rec.id}
                className="flex gap-4 rounded-lg border border-line bg-surface p-4"
              >
                <Link
                  href={href}
                  className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded border border-line"
                >
                  {poster && (
                    <Image src={poster} alt="" fill sizes="80px" className="object-cover" />
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <Link href={href} className="hover:text-accent">
                    <p className="font-medium">
                      {rec.name}{" "}
                      <span className="font-normal text-ink-faint">
                        {rec.releaseDate?.slice(0, 4)}
                      </span>
                    </p>
                  </Link>

                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                    {rec.reason}
                  </p>

                  <p className="mt-2 text-[11px] uppercase tracking-wider text-ink-faint">
                    {rec.mediaType === "film" ? "Film" : "TV"} ·{" "}
                    {SOURCE_LABEL[rec.source] ?? rec.source}
                  </p>

                  <div className="mt-3 flex items-center gap-3">
                    <AddButton tmdbId={rec.tmdbId} mediaType={rec.mediaType} alreadyOn={false} />
                    <DismissButton id={rec.id} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
