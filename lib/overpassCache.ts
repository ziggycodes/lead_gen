import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";

// Overpass results change slowly; share them across users for 7 days.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function keyFor(query: string): string {
  return createHash("sha256").update(query).digest("hex");
}

// Matches the { get, set } cache interface accepted by src/overpass.js runQuery.
export const overpassDbCache = {
  async get(query: string): Promise<unknown[] | null> {
    const key = keyFor(query);
    const row = await db().query.overpassCache.findFirst({
      where: eq(schema.overpassCache.key, key),
    });
    if (!row || new Date(row.expiresAt) < new Date()) return null;
    return row.payload as unknown[];
  },

  async set(query: string, elements: unknown[]): Promise<void> {
    const key = keyFor(query);
    const expiresAt = new Date(Date.now() + TTL_MS);
    await db()
      .insert(schema.overpassCache)
      .values({ key, payload: elements, expiresAt })
      .onConflictDoUpdate({
        target: schema.overpassCache.key,
        set: { payload: elements, fetchedAt: sql`now()`, expiresAt },
      });
  },
};
