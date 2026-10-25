import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Lazy singleton so importing this module never opens a connection at build time.
declare global {
  // eslint-disable-next-line no-var
  var __leadscoutPool: Pool | undefined;
}

function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it to your .env file.");
  }
  if (!globalThis.__leadscoutPool) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      // Fail a request instead of hanging when every connection is busy or Neon is waking up.
      connectionTimeoutMillis: 15_000,
      // Neon drops idle connections; close ours first.
      idleTimeoutMillis: 30_000,
    });
    // An idle client killed by the server (autosuspend, idle timeout) emits here.
    // Without a listener Node treats it as an uncaught exception.
    pool.on("error", (err) => {
      console.error("[db] idle client error:", err.message);
    });
    globalThis.__leadscoutPool = pool;
  }
  return globalThis.__leadscoutPool;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function db() {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export type Db = ReturnType<typeof db>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
// Either the pool or an open transaction. Helpers that run inside a
// transaction take one so they never borrow a second connection.
export type Executor = Db | Tx;

export { schema };
