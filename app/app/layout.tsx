import { redirect } from "next/navigation";
import { ensureUser, ForbiddenError, RestrictedError, UnauthorizedError } from "@/lib/users";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  try {
    await ensureUser();
  } catch (err) {
    if (err instanceof RestrictedError) redirect("/restricted");
    if (err instanceof ForbiddenError) redirect("/not-invited");
    if (err instanceof UnauthorizedError) redirect("/sign-in");
    throw err;
  }

  return children;
}
