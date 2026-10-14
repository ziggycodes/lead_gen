import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/app(.*)",
]);

// Paths exempt from the country gate.
const isGateExempt = createRouteMatcher([
  "/waitlist(.*)",
  "/api/webhooks(.*)",
  "/api/health(.*)",
]);

// Next.js holds the request open until every fetch started in proxy settles.
// These debug posts must be awaited and fully read, or /api/search never runs.
async function agentLog(sessionId: string, payload: Record<string, unknown>) {
  try {
    const res = await fetch("http://127.0.0.1:7356/ingest/edc6ece9-d9d8-4c72-941c-15ccbf388031", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": sessionId },
      body: JSON.stringify(payload),
    });
    await res.arrayBuffer();
  } catch {
    // A failed debug log must never block the search.
  }
}

export default clerkMiddleware(async (auth, req) => {
  const path = req.nextUrl.pathname;
  if (path.startsWith("/api/search")) {
    // #region agent log
    await agentLog("b660e9", {
      sessionId: "b660e9",
      runId: "post-fix",
      hypothesisId: "F",
      location: "proxy.ts:before-protect",
      message: "search request entered proxy",
      data: { path, search: req.nextUrl.search },
      timestamp: Date.now(),
    });
    // #endregion
  }
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
  if (path.startsWith("/api/search")) {
    // #region agent log
    await agentLog("b660e9", {
      sessionId: "b660e9",
      runId: "post-fix",
      hypothesisId: "F",
      location: "proxy.ts:after-protect",
      message: "search request passed clerk protect",
      data: { path },
      timestamp: Date.now(),
    });
    // #endregion
    // #region agent log
    await agentLog("e14203", {
      sessionId: "e14203",
      runId: "post-fix",
      hypothesisId: "A",
      location: "proxy.ts:exit",
      message: "search proxy handler finished and released its debug fetches",
      data: { path, protected: isProtectedRoute(req) },
      timestamp: Date.now(),
    });
    // #endregion
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
