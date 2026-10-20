import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureUser } from "@/lib/users";
import { CRM_EXPORT_COLUMNS, toExportLead } from "@/lib/leads";
import { leadsToBuffer } from "@/src/output.js";
import { badRequest, errorResponse, parseIds } from "@/lib/apiError";

export const dynamic = "force-dynamic";

// POST /api/leads/export  { format: "csv" | "xlsx", ids?: number[] }
// POST (not GET) so a large filtered selection doesn't overflow the URL.
export async function POST(req: NextRequest) {
  try {
    const user = await ensureUser();
    const body = await req.json().catch(() => ({}));
    const format = body?.format === "xlsx" ? "xlsx" : "csv";

    let where = eq(schema.leads.userId, user.id);
    if (body?.ids !== undefined) {
      const ids = parseIds(body.ids);
      if (!ids) return badRequest("No leads selected to export.");
      where = and(where, inArray(schema.leads.id, ids))!;
    }

    const rows = await db().query.leads.findMany({
      where,
      orderBy: [desc(schema.leads.lastActivityAt)],
    });
    if (!rows.length) return badRequest("No leads to export.", 404);

    const { buffer, contentType, filename } = await leadsToBuffer(
      rows.map(toExportLead),
      format,
      CRM_EXPORT_COLUMNS
    );
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="leadscout-crm-${filename}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
