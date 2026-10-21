import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AllowlistManager } from "@/components/admin/AllowlistManager";
import { adminEmails } from "@/lib/access";
import { db, schema } from "@/lib/db";
import { ForbiddenError, requireAdmin, UnauthorizedError } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Access — LeadScout",
};

export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/sign-in");
    if (err instanceof ForbiddenError) redirect("/app");
    throw err;
  }

  const rows = await db()
    .select({ email: schema.allowedEmails.email })
    .from(schema.allowedEmails)
    .orderBy(asc(schema.allowedEmails.createdAt));

  return <AllowlistManager admins={adminEmails()} initialEmails={rows.map((row) => row.email)} />;
}
