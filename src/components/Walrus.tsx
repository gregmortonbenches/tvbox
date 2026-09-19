import { walrusSays, type WalrusContext } from "@/lib/walrusLines";
import { WalrusArt } from "./WalrusArt";

/*
 * The mascot. Says something about whatever's on screen — see
 * lib/walrusLines.ts for how the line is chosen (locally, deterministically,
 * and for free).
 *
 * He inherits his colour from `text-*` via currentColor in the artwork.
 */
export function Walrus({ context }: { context: WalrusContext }) {
  const line = walrusSays(context);

  return (
    <div className="mb-8 flex items-center gap-4">
      <WalrusArt
        className="size-16 shrink-0 text-tobi sm:size-20"
        title="The tvbox walrus"
      />

      <div className="relative rounded-2xl rounded-bl-sm border border-line bg-surface px-4 py-3">
        {/* bubble tail pointing back at him */}
        <span
          aria-hidden
          className="absolute -left-[7px] bottom-4 size-3 rotate-45 border-b border-l border-line bg-surface"
        />
        <p className="text-sm italic leading-snug text-ink-muted">{line}</p>
      </div>
    </div>
  );
}
