import { Brand } from "@/components/Brand";
import { NotInvitedActions } from "@/components/NotInvitedActions";

export const metadata = {
  title: "Not invited — LeadScout",
};

export default function NotInvitedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <Brand />
      <h1 className="mt-8 font-display text-3xl font-semibold tracking-tight">
        This email can’t sign in
      </h1>
      <p className="mt-3 text-muted">
        LeadScout is open to approved emails only. Ask the account owner to add
        your address, then sign in again.
      </p>
      <NotInvitedActions />
    </main>
  );
}
