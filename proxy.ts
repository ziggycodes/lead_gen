import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/app(.*)",
  "/admin(.*)",
  "/restricted(.*)",
]);

// Paths exempt from the country gate.
const isGateExempt = createRouteMatcher([
  "/waitlist(.*)",
  "/api/webhooks(.*)",
  "/api/health(.*)",
  // Inngest calls this from its own servers to run background searches.
  "/api/inngest(.*)",
]);

// Only session tokens minted for these origins are accepted in production, so
// another app on a nocodeziggy.com subdomain can't create LeadScout sessions.
// Previews and local dev use the Clerk development instance and stay open.
const PRODUCTION_ORIGINS = ["https://leadscout.nocodeziggy.com"];
const authorizedParties = process.env.VERCEL_ENV === "production" ? PRODUCTION_ORIGINS : undefined;

export default clerkMiddleware(async (auth, req) => {
  // Nigeria-only soft gate (ALLOWED_COUNTRIES=NG). Header-based; if the hosting
  // platform doesn't provide a country header, requests pass through (dev mode).
  const allowed = process.env.ALLOWED_COUNTRIES;
  if (allowed && !isGateExempt(req)) {
    const country =
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-vercel-ip-country") ||
      req.headers.get("x-country-code");
    const allowedList = allowed.split(",").map((c) => c.trim().toUpperCase());
    if (country && !allowedList.includes(country.toUpperCase())) {
      return NextResponse.redirect(new URL("/waitlist", req.url));
    }
  }

  if (isProtectedRoute(req)) await auth.protect();
}, { authorizedParties });

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
