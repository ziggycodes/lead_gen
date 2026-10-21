import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { NotInvitedActions } from "@/components/NotInvitedActions";
import { ForbiddenError, readUser, UnauthorizedError } from "@/lib/users";

export const metadata = {
  title: "Account locked — LeadScout",
};

export default async function RestrictedPage() {
  let note: string | null = null;
  try {
    const user = await readUser();
    if (user.accountStatus !== "restricted") redirect("/app");
    note = user.accountNote?.trim() || null;
  } catch (err) {
    if (err instanceof ForbiddenError) redirect("/not-invited");
    if (err instanceof UnauthorizedError) redirect("/sign-in");
    throw err;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <Brand />
      <h1 className="mt-8 font-display text-3xl font-semibold tracking-tight">Your account is locked</h1>
      <p className="mt-3 text-muted">
        {note
          ? note
          : "An admin locked this account. You can use LeadScout again after they lift the lock."}
      </p>
      <NotInvitedActions />
    </main>
  );
}
