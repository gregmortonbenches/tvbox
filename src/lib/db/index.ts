import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/*
 * One postgres.js pool per process. Next.js hot-reloads modules in dev,
 * which would otherwise open a new pool on every save until the database
 * refuses connections — so the client is stashed on globalThis in dev only.
 */
const globalForDb = globalThis as unknown as {
  tvboxSql: ReturnType<typeof postgres> | undefined;
};

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at your Postgres instance.",
    );
  }
  return postgres(url, { max: 5 });
}

const client = globalForDb.tvboxSql ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.tvboxSql = client;

export const db = drizzle(client, { schema });
export { schema };
