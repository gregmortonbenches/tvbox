/** Shared URL helpers. No server-only imports — safe to use in client components. */

export function titleHref(mediaType: "tv" | "film", tmdbId: number): string {
  return `/${mediaType}/${tmdbId}`;
}

const IMAGE_BASE = "https://image.tmdb.org/t/p";

export function posterUrl(path: string | null, size: "w342" | "w500" = "w342") {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}
