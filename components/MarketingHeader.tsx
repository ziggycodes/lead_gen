"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Brand } from "./Brand";

export function MarketingHeader({
  variant = "default",
}: {
  variant?: "default" | "overlay";
}) {
  const { isSignedIn } = useAuth();
  const overlay = variant === "overlay";

  return (
    <header
      className={
        overlay
          ? "absolute inset-x-0 top-0 z-20 px-4 pt-4 sm:px-6 sm:pt-5"
          : "sticky top-0 z-10 border-b border-line bg-panel/90 backdrop-blur-md"
      }
    >
      <div
        className={
          overlay
            ? "mx-auto flex max-w-6xl items-center justify-between rounded-full border border-white/40 bg-white/95 px-4 py-2.5 shadow-lg shadow-black/5 backdrop-blur-md sm:px-5"
            : "mx-auto flex max-w-6xl items-center justify-between px-6 py-4"
        }
      >
        <Brand />
        <nav className="flex items-center gap-3 text-sm sm:gap-5">
          <Link
            href="/pricing"
            className="hidden text-muted transition-colors hover:text-fg sm:inline"
          >
            Pricing
          </Link>
          {isSignedIn ? (
            <Link
              href="/app"
              className="rounded-full bg-ink px-4 py-2 font-semibold text-white transition-opacity hover:opacity-90"
            >
              Open dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="text-muted transition-colors hover:text-fg"
              >
                Log in
              </Link>
              <Link
                href="/sign-up"
                className="rounded-full bg-ink px-4 py-2 font-semibold text-white transition-opacity hover:opacity-90"
              >
                Start free
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
