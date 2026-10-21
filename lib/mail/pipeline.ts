import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logActivity } from "@/lib/leads";

type LeadStatusRow = { id: number; status: string };

export async function noteEmailSent(userId: number, lead: LeadStatusRow, to: string) {
  if (lead.status === "new") {
    await db()
      .update(schema.leads)
      .set({ status: "contacted", updatedAt: new Date() })
      .where(and(eq(schema.leads.id, lead.id), eq(schema.leads.userId, userId)));
    await logActivity(userId, [lead.id], "status_changed", { from: "new", to: "contacted" });
    lead.status = "contacted";
  }
  await logActivity(userId, [lead.id], "email_sent", { to });
}

export async function noteEmailReceived(userId: number, lead: LeadStatusRow, from: string) {
  if (lead.status === "new" || lead.status === "contacted") {
    const previous = lead.status;
    await db()
      .update(schema.leads)
      .set({ status: "replied", updatedAt: new Date() })
      .where(and(eq(schema.leads.id, lead.id), eq(schema.leads.userId, userId)));
    await logActivity(userId, [lead.id], "status_changed", { from: previous, to: "replied" });
    lead.status = "replied";
  }
  await logActivity(userId, [lead.id], "email_received", { from });
}
