import type { Metadata } from "next";
import { readUnsubscribeToken } from "@/lib/mail/unsubscribeToken";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
};

export default async function UnsubscribePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { done } = await searchParams;
  const target = readUnsubscribeToken(token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-oat px-4 py-10 text-fg">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel px-6 py-6">
        {!target ? (
          <>
            <h1 className="font-display text-xl font-semibold">This link isn&apos;t valid</h1>
            <p className="mt-2 text-sm text-muted">
              It may be incomplete. Try the full link from the email, or reply to the sender and ask to be removed.
            </p>
          </>
        ) : done ? (
          <>
            <h1 className="font-display text-xl font-semibold">You&apos;re unsubscribed</h1>
            <p className="mt-2 text-sm text-muted">
              {target.email} won&apos;t get any more emails from this sender through LeadScout.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-xl font-semibold">Unsubscribe from these emails?</h1>
            <p className="mt-2 text-sm text-muted">
              {target.email} will stop getting emails from this sender through LeadScout.
            </p>
            <form action={`/api/unsubscribe/${token}`} method="post" className="mt-5">
              <input type="hidden" name="source" value="page" />
              <button type="submit" className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-ink">
                Unsubscribe
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
