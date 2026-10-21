import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { listAccounts } from "@/lib/accounts";
import { adminEmails } from "@/lib/access";
import { db, schema } from "@/lib/db";
import { ForbiddenError, requireAdmin, UnauthorizedError } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Accounts — LeadScout",
};

export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/sign-in");
    if (err instanceof ForbiddenError) redirect("/app");
    throw err;
  }

  const [rows, accounts] = await Promise.all([
    db()
      .select({ email: schema.allowedEmails.email })
      .from(schema.allowedEmails)
      .orderBy(asc(schema.allowedEmails.createdAt)),
    listAccounts(),
  ]);

  return (
    <AdminConsole
      admins={adminEmails()}
      initialEmails={rows.map((row) => row.email)}
      initialAccounts={accounts}
    />
  );
}
