import { NextRequest, NextResponse } from "next/server";
import { and, eq, desc, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureUser, UnauthorizedError } from "@/lib/users";
import { leadKey, type LeadLike } from "@/lib/leadKey";
import { filterContactable } from "@/src/contactable.js";

export const dynamic = "force-dynamic";

// GET /api/searches           -> recent search history (metadata only, no blob)
// GET /api/searches?id=123    -> the stored leads for one past search, tagged
//                                with their CRM ids where they exist
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
      const leads = filterContactable(
        ((row.resultBlob as LeadLike[]) || []).filter((l) => l && typeof l === "object")
      );
      const keys = Array.from(new Set(leads.map((l) => leadKey(l))));
      const idsByKey = new Map<string, number>();
      for (let i = 0; i < keys.length; i += 1000) {
        const found = await db()
          .select({ id: schema.leads.id, leadKey: schema.leads.leadKey })
          .from(schema.leads)
          .where(
            and(
              eq(schema.leads.userId, user.id),
              inArray(schema.leads.leadKey, keys.slice(i, i + 1000))
            )
          );
        for (const f of found) idsByKey.set(f.leadKey, f.id);
      }
      return NextResponse.json({
        id: row.id,
        params: row.params,
        leads: leads.map((l) => {
          const crmId = idsByKey.get(leadKey(l));
          return crmId ? { ...l, _crmId: crmId } : l;
        }),
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
