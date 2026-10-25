import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db, schema, type Executor } from "./db";

export interface AdminActionEntry {
  id: number;
  adminEmail: string;
  targetUserId: number | null;
  targetLabel: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export async function recordAdminAction(
  executor: Executor,
  entry: {
    adminEmail: string;
    action: string;
    targetUserId?: number | null;
    targetEmail?: string | null;
    detail?: Record<string, unknown> | null;
  }
): Promise<void> {
  await executor.insert(schema.adminActions).values({
    adminEmail: entry.adminEmail,
    action: entry.action,
    targetUserId: entry.targetUserId ?? null,
    targetEmail: entry.targetEmail ?? null,
    detail: entry.detail ?? null,
  });
}

// Newest first. `before` is the id of the last row the caller already has.
export async function listAdminActions(opts: {
  targetUserId?: number;
  before?: number;
  limit?: number;
}): Promise<AdminActionEntry[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const filters = [];
  if (opts.targetUserId) filters.push(eq(schema.adminActions.targetUserId, opts.targetUserId));
  if (opts.before) filters.push(lt(schema.adminActions.id, opts.before));

  const rows = await db()
    .select({
      id: schema.adminActions.id,
      adminEmail: schema.adminActions.adminEmail,
      targetUserId: schema.adminActions.targetUserId,
      targetLabel: sql<string | null>`coalesce(${schema.users.name}, ${schema.users.email}, ${schema.adminActions.targetEmail})`,
      action: schema.adminActions.action,
      detail: schema.adminActions.detail,
      createdAt: schema.adminActions.createdAt,
    })
    .from(schema.adminActions)
    .leftJoin(schema.users, eq(schema.users.id, schema.adminActions.targetUserId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.adminActions.id))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    detail: (row.detail as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}
