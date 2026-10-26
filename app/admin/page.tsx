import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { listAccounts } from "@/lib/accounts";
import { adminEmails } from "@/lib/access";
import { overviewStats } from "@/lib/adminStats";
import { db, schema } from "@/lib/db";
import { ForbiddenError, requireAdmin, UnauthorizedError } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin — LeadScout",
};

export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) redirect("/");
    throw err;
  }

  const [rows, accounts, stats] = await Promise.all([
    db()
      .select({ email: schema.allowedEmails.email })
      .from(schema.allowedEmails)
      .orderBy(asc(schema.allowedEmails.createdAt)),
    listAccounts(),
    overviewStats(30),
  ]);

  return (
    <AdminConsole
      admins={adminEmails()}
      initialEmails={rows.map((row) => row.email)}
      initialAccounts={accounts}
      initialStats={stats}
    />
  );
}
