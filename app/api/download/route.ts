import { NextRequest, NextResponse } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureUser, UnauthorizedError } from "@/lib/users";
import { leadsToBuffer } from "@/src/output.js";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await ensureUser();
    const format = (req.nextUrl.searchParams.get("format") || "csv").toLowerCase();

    const search = await db().query.searches.findFirst({
      where: and(eq(schema.searches.userId, user.id), eq(schema.searches.status, "completed")),
      orderBy: [desc(schema.searches.createdAt)],
    });

    const leads = (search?.resultBlob as unknown[]) || [];
    if (!leads.length) {
      return NextResponse.json(
        { error: "No results to download yet. Run a search first." },
        { status: 404 }
      );
    }

    const { buffer, contentType, filename } = await leadsToBuffer(leads, format);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="leadscout-${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
