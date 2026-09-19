import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";
import { cookieNames, readWho } from "./auth";

export type CurrentUser = typeof users.$inferSelect;

/**
 * The person currently using the app, or null if the profile cookie is
 * missing/tampered with. Gate (password) checking happens in middleware;
 * this only answers "which of the two is this".
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const userId = await readWho(jar.get(cookieNames.who)?.value);
  if (!userId) return null;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

/** Both profiles, for the picker and for side-by-side ratings. */
export async function getAllUsers(): Promise<CurrentUser[]> {
  return db.select().from(users).orderBy(users.createdAt);
}
