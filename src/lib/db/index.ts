import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/*
 * The database client, created LAZILY.
 *
 * Why lazy: `next build` imports every route module to collect its config.
 * If the connection were built at module load, a build with no DATABASE_URL
 * set — exactly what happens the first time you deploy and forget to add the
 * env var — would fail during page-data collection with a confusing error
 * rather than at the first real request. Nothing here touches the env until
 * a query actually runs.
 *
 * Why the globalThis stash: Next hot-reloads modules in dev, which would
 * otherwise open a fresh pool on every save until Postgres refuses more
 * connections.
 */
const globalForDb = globalThis as unknown as {
  tvboxSql: ReturnType<typeof postgres> | undefined;
  tvboxDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
};

/*
 * Serverless changes the pooling maths. Each Vercel function instance is its
 * own process with its own pool, so `max: 5` across 20 warm instances is 100
 * connections — past the limit on most free Postgres tiers. One connection
 * per instance, closed promptly when idle, is the right shape; the platform
 * does the scaling, not the pool.
 *
 * `prepare: false` matters if DATABASE_URL points at a TRANSACTION-mode
 * pooler (Supabase's port 6543, PgBouncer, Supavisor). Those can't carry
 * prepared statements across pooled connections and fail with obscure errors.
 * Disabling them costs nothing measurable at this scale and makes every
 * connection string work.
 */
const isProduction = process.env.NODE_ENV === "production";

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Locally: copy .env.example to .env.local. " +
        "On a host: add it to the project's environment variables.",
    );
  }
  return postgres(url, {
    max: isProduction ? 1 : 5,
    idle_timeout: isProduction ? 20 : undefined,
    prepare: !isProduction,
  });
}

function getDb() {
  if (!globalForDb.tvboxDb) {
    const client = globalForDb.tvboxSql ?? createClient();
    if (!isProduction) globalForDb.tvboxSql = client;
    globalForDb.tvboxDb = drizzle(client, { schema });
  }
  return globalForDb.tvboxDb;
}

/*
 * Proxied so call sites stay `db.select()...` rather than `getDb().select()`,
 * while the real client is still only built on first use.
 */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
