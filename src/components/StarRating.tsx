"use client";

import { useOptimistic, useTransition } from "react";
import { clearRating, rateTitle } from "@/lib/actions";
import type { MediaType } from "@/lib/db/schema";

/*
 * Half-star rating, Letterboxd-style: the left half of a star picks the half,
 * the right half picks the whole. `value` is in half-star units (1..10) to
 * match how ratings are stored — see the ratings table comment.
 *
 * Clicking the rating you already have clears it, as Letterboxd does, which
 * saves needing a separate "remove" control.
 */
export function StarRating({
  titleId,
  mediaType,
  tmdbId,
  value,
  color,
  readOnly = false,
  size = "md",
}: {
  titleId: string;
  mediaType: MediaType;
  tmdbId: number;
  value: number | null;
  color?: string;
  readOnly?: boolean;
  size?: "sm" | "md";
}) {
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [, startTransition] = useTransition();

  const px = size === "sm" ? 14 : 20;
  const current = optimistic ?? 0;

  function pick(half: number) {
    if (readOnly) return;
    startTransition(async () => {
      if (half === current) {
        setOptimistic(null);
        await clearRating(titleId, mediaType, tmdbId);
      } else {
        setOptimistic(half);
        await rateTitle(titleId, half, mediaType, tmdbId);
      }
    });
  }

  return (
    <div
      className="flex items-center gap-0.5"
      role={readOnly ? "img" : "group"}
      aria-label={current > 0 ? `${current / 2} out of 5 stars` : "Not rated"}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fullAt = star * 2;
        const halfAt = fullAt - 1;
        const fill = current >= fullAt ? 1 : current === halfAt ? 0.5 : 0;
        return (
          <span key={star} className="relative inline-block" style={{ width: px, height: px }}>
            <Star px={px} fill={fill} color={color} />
            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={() => pick(halfAt)}
                  aria-label={`${star - 0.5} stars`}
                  className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => pick(fullAt)}
                  aria-label={`${star} stars`}
                  className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
                />
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}

function Star({ px, fill, color }: { px: number; fill: number; color?: string }) {
  const id = `half-${String(fill).replace(".", "_")}`;
  const tint = color ?? "var(--color-accent)";
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" aria-hidden className="block">
      <defs>
        <linearGradient id={id}>
          <stop offset="50%" stopColor={tint} />
          <stop offset="50%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z"
        fill={fill === 1 ? tint : fill === 0.5 ? `url(#${id})` : "transparent"}
        stroke={tint}
        strokeWidth={fill === 0 ? 1.4 : 0}
        strokeOpacity={0.45}
        strokeLinejoin="round"
      />
    </svg>
  );
}
