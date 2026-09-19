import { chooseWho } from "@/lib/actions";
import { getAllUsers } from "@/lib/session";

export default async function WhoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const people = await getAllUsers();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4">
      <h1 className="mb-10 text-lg text-ink-muted">Who&rsquo;s watching?</h1>

      {people.length === 0 ? (
        <p className="max-w-sm text-center text-sm text-ink-faint">
          No profiles yet. Run <code className="text-accent">npm run db:seed</code> to
          create them.
        </p>
      ) : (
        <div className="flex flex-wrap justify-center gap-8">
          {people.map((p) => (
            <form
              key={p.id}
              action={async () => {
                "use server";
                await chooseWho(p.id, next ?? "/");
              }}
            >
              <button type="submit" className="group flex flex-col items-center gap-3">
                <span
                  className="flex size-24 items-center justify-center rounded-xl text-3xl font-bold text-canvas transition-transform duration-200 group-hover:scale-105"
                  style={{ background: p.accentColor }}
                >
                  {p.displayName.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm text-ink-muted transition-colors group-hover:text-ink">
                  {p.displayName}
                </span>
              </button>
            </form>
          ))}
        </div>
      )}
    </main>
  );
}
