import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertAiAllowed, researchLead } from "@/lib/insights";
import { INSIGHTS_REQUESTED, inngest } from "./client";

export const insightJob = inngest.createFunction(
  {
    id: "run-lead-insights",
    triggers: [{ event: INSIGHTS_REQUESTED }],
    // Keeps one account from hogging the model rate limit.
    concurrency: { key: "event.data.userId", limit: 1 },
    retries: 2,
    onFailure: async ({ event, error }) => {
      const userId = Number(event.data.event.data?.userId);
      const leadIds = (event.data.event.data?.leadIds as number[] | undefined) ?? [];
      console.error(`[insights user ${userId}] run failed:`, error.message);
      if (!userId || !leadIds.length) return;
      // Anything still pending would spin forever in the UI.
      await db()
        .update(schema.leads)
        .set({ insightStatus: "failed" })
        .where(
          and(eq(schema.leads.userId, userId), inArray(schema.leads.id, leadIds), eq(schema.leads.insightStatus, "pending"))
        );
    },
  },
  async ({ event, step }) => {
    const userId = Number(event.data.userId);
    const leadIds = (event.data.leadIds as number[]).map(Number);
    // Re-checked so turning AI off mid-run stops the rest.
    const offer = await step.run("check-access", () => assertAiAllowed(userId));

    const PARALLEL = 3;
    let done = 0;
    for (let i = 0; i < leadIds.length; i += PARALLEL) {
      const wave = leadIds.slice(i, i + PARALLEL);
      await Promise.all(
        wave.map((leadId) =>
          step.run(`lead-${leadId}`, async () => {
            await researchLead(userId, leadId, offer);
            return leadId;
          })
        )
      );
      done += wave.length;
    }
    return { userId, done };
  }
);
