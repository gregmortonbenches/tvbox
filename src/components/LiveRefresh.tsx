"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/*
 * Keeps two open tabs in step.
 *
 * With exactly two users, a websocket/SSE channel is a lot of moving parts
 * for a handful of writes an evening. Instead this re-runs the page's server
 * components on a timer and whenever the tab regains focus, which is enough
 * for "Hannah ticked an episode downstairs and it shows up on my phone".
 *
 * router.refresh() re-fetches server data WITHOUT losing client state or
 * scroll position, so a poll mid-scroll isn't disruptive. Polling pauses
 * while the tab is hidden so a forgotten tab isn't hammering the database
 * overnight.
 */
const POLL_MS = 10_000;

export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      stop();
      timer = setInterval(() => router.refresh(), POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh(); // catch up immediately on return
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [router]);

  return null;
}
