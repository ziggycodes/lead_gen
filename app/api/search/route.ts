import { NextRequest, NextResponse } from "next/server";
import { ensureUser } from "@/lib/users";
import { errorResponse } from "@/lib/apiError";
import { createSearchJob, finishJob, SearchJobError, toJobView } from "@/lib/searchJobs";
import { inngest, SEARCH_REQUESTED } from "@/lib/inngest/client";

export const dynamic = "force-dynamic";

// POST /api/search { niches?, states?, limit? } -> queue a background search.
// Returns at once; the client polls /api/searches/:id. Free accounts ignore the body.
export async function POST(req: NextRequest) {
  try {
    const user = await ensureUser();
    const body = await req.json().catch(() => ({}));
    let job;
    try {
      job = await createSearchJob(user, {
        niches: typeof body?.niches === "string" ? body.niches : undefined,
        states: typeof body?.states === "string" ? body.states : undefined,
        limit: Number(body?.limit) || undefined,
      });
    } catch (err) {
      if (err instanceof SearchJobError) {
        return NextResponse.json({ error: err.message, searchId: err.searchId }, { status: err.status });
      }
      throw err;
    }

    try {
      await inngest.send({ name: SEARCH_REQUESTED, data: { searchId: job.id, userId: user.id } });
    } catch (err) {
      console.error(`[search ${job.id}] could not queue:`, (err as Error).message);
      await finishJob(job.id, "The search could not start.");
      return NextResponse.json({ error: "The search could not start. Please try again." }, { status: 503 });
    }
    return NextResponse.json({ search: toJobView(job) }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
