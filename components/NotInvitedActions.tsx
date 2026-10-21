"use client";

import Link from "next/link";
import { useAuth, useClerk } from "@clerk/nextjs";

export function NotInvitedActions() {
  const { isSignedIn, isLoaded } = useAuth();
  const clerk = useClerk();

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <Link
        href="/sign-in"
        className="mt-8 inline-flex w-fit rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Sign in
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => clerk.signOut({ redirectUrl: "/sign-in" })}
      className="mt-8 inline-flex w-fit rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
    >
      Sign out
    </button>
  );
}
