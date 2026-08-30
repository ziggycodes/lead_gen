import { NextRequest, NextResponse } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureUser, UnauthorizedError } from "@/lib/users";

export const dynamic = "force-dynamic";

// GET /api/searches           -> recent search history (metadata only, no blob)
// GET /api/searches?id=123    -> the stored leads for one past search
export async function GET(req: NextRequest) {
  try {
    const user = await ensureUser();
    const id = req.nextUrl.searchParams.get("id");

    if (id) {
      const row = await db().query.searches.findFirst({
        where: and(
          eq(schema.searches.id, Number(id)),
          eq(schema.searches.userId, user.id)
        ),
      });
      if (!row) {
        return NextResponse.json({ error: "Search not found." }, { status: 404 });
      }
      return NextResponse.json({
        id: row.id,
        params: row.params,
        leads: (row.resultBlob as unknown[]) || [],
      });
    }

    const rows = await db().query.searches.findMany({
      where: eq(schema.searches.userId, user.id),
      orderBy: [desc(schema.searches.createdAt)],
      limit: 20,
      columns: {
        id: true,
        status: true,
        params: true,
        leadCount: true,
        createdAt: true,
        completedAt: true,
      },
    });
    return NextResponse.json({ searches: rows });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
