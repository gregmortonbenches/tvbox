/*
 * Creates the two profiles. Run once per database:  npm run db:seed
 *
 * Names and colours come from env vars so this file carries no personal
 * details — set them in .env.local, or accept the defaults.
 *
 * Idempotent: re-running updates the display name and colour rather than
 * creating duplicates, so it's safe to run after changing the env vars.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "../src/lib/db/schema.ts";

const PEOPLE = [
  {
    username: process.env.SEED_USER_1 ?? "greg",
    displayName: process.env.SEED_NAME_1 ?? "Greg",
    accentColor: "#f6ad49", // koji — 柑子色
  },
  {
    username: process.env.SEED_USER_2 ?? "hannah",
    displayName: process.env.SEED_NAME_2 ?? "Hannah",
    accentColor: "#a2bfe0", // kamenozoki — 瓶覗
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  for (const person of PEOPLE) {
    await db
      .insert(users)
      .values(person)
      .onConflictDoUpdate({
        target: users.username,
        set: { displayName: person.displayName, accentColor: person.accentColor },
      });
    console.log(`✓ ${person.displayName} (${person.username})`);
  }

  await client.end();
  console.log("\nDone. Two profiles ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
