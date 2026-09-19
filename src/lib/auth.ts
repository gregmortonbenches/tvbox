/*
 * Access control for a two-person app.
 *
 * There are no accounts to sign up for and no per-person permissions: one
 * shared password gets you in, then you say which of you is using it. The
 * password keeps strangers out; the profile choice decides whose ticks and
 * ratings you're writing. Both are cookies.
 *
 * Deliberately NOT a full auth system. If this ever grows past the two of
 * you, replace it wholesale rather than bolting roles onto it.
 *
 * Uses Web Crypto (not node:crypto) throughout so the same code runs in
 * middleware on the edge runtime as well as in server components.
 */
const GATE_COOKIE = "tvbox_gate";
const WHO_COOKIE = "tvbox_who";
const MAX_AGE = 60 * 60 * 24 * 365; // a year — it's a sofa app, don't log them out

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    throw new Error(
      "AUTH_SECRET is not set. Generate one with: openssl rand -base64 32",
    );
  }
  return s;
}

const encoder = new TextEncoder();

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Buffer.from(sig).toString("base64url");
}

/** Constant-time compare so a wrong password can't be probed byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function checkPassword(attempt: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    throw new Error("APP_PASSWORD is not set — refusing to let anyone in.");
  }
  // Hash both sides first: equal-length digests mean the compare can't leak
  // the real password's length.
  const [a, b] = await Promise.all([hmac(attempt), hmac(expected)]);
  return timingSafeEqual(a, b);
}

/** Token format: `<payload>.<hmac(payload)>`. */
async function sign(payload: string): Promise<string> {
  return `${payload}.${await hmac(payload)}`;
}

async function unsign(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = await hmac(payload);
  return timingSafeEqual(sig, expected) ? payload : null;
}

export const cookieNames = { gate: GATE_COOKIE, who: WHO_COOKIE } as const;

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
} as const;

export async function makeGateCookie(): Promise<string> {
  return sign("ok");
}

export async function isGateValid(token: string | undefined): Promise<boolean> {
  return (await unsign(token)) === "ok";
}

export async function makeWhoCookie(userId: string): Promise<string> {
  return sign(userId);
}

export async function readWho(token: string | undefined): Promise<string | null> {
  return unsign(token);
}
