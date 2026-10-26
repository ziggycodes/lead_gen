import webpush from "web-push";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "./db";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

let configured: boolean | undefined;

// Push is optional: without VAPID keys (local dev, previews) sends are skipped.
function ensureConfigured(): boolean {
  if (configured !== undefined) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn("[push] VAPID keys not set; browser notifications are off.");
    configured = false;
    return configured;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@nocodeziggy.com", publicKey, privateKey);
  configured = true;
  return configured;
}

// Validates the JSON a browser's PushSubscription serialises to.
export function parseSubscription(value: unknown): BrowserSubscription | null {
  const v = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = v?.endpoint;
  const p256dh = v?.keys?.p256dh;
  const auth = v?.keys?.auth;
  if (typeof endpoint !== "string" || endpoint.length > 2000) return null;
  if (typeof p256dh !== "string" || p256dh.length > 200) return null;
  if (typeof auth !== "string" || auth.length > 100) return null;
  try {
    if (new URL(endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { endpoint, keys: { p256dh, auth } };
}

// A browser belongs to whoever subscribed last, so a shared machine follows the signed-in account.
export async function saveSubscription(userId: number, sub: BrowserSubscription, userAgent: string | null) {
  await db()
    .insert(schema.pushSubscriptions)
    .values({
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent?.slice(0, 300) ?? null,
    })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent?.slice(0, 300) ?? null,
      },
    });
}

export async function removeSubscription(userId: number, endpoint: string) {
  await db()
    .delete(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.userId, userId), eq(schema.pushSubscriptions.endpoint, endpoint)));
}

// Sends to every browser the user enabled. Never throws: a notification must not fail a search.
export async function notifyUser(userId: number, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;
  try {
    const subs = await db()
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, userId));
    if (!subs.length) return 0;

    const body = JSON.stringify(payload);
    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 60 * 60 * 24,
        })
      )
    );

    const expired: number[] = [];
    const delivered: number[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") return void delivered.push(subs[i].id);
      const status = (r.reason as { statusCode?: number }).statusCode;
      // 404/410 mean the browser dropped the subscription; anything else may be transient.
      if (status === 404 || status === 410) expired.push(subs[i].id);
      else console.error(`[push] send to user ${userId} failed (${status ?? "no status"}):`, (r.reason as Error).message);
    });

    if (expired.length) {
      await db().delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, expired));
    }
    if (delivered.length) {
      await db()
        .update(schema.pushSubscriptions)
        .set({ lastUsedAt: sql`now()` })
        .where(inArray(schema.pushSubscriptions.id, delivered));
    }
    return delivered.length;
  } catch (err) {
    console.error(`[push] notify user ${userId} failed:`, (err as Error).message);
    return 0;
  }
}
