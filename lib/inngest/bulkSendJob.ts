import { markBulkSendFailed, sendNextRecipient } from "@/lib/mail/bulk";
import { syncMailbox } from "@/lib/mail/sync";
import { BULK_SEND_REQUESTED, inngest } from "./client";

// Used after a skip or a failed send. Successful sends get a gap from
// lib/mail/warmup.ts that spreads the day's cap across the sending window.
const SEND_GAP = "150s";
const RATE_LIMIT_WAIT = "10m";
// Inngest caps steps per run; 200 recipients plus rate-limit retries fit well inside this.
const MAX_ROUNDS = 450;

export const bulkSendJob = inngest.createFunction(
  {
    id: "run-bulk-send",
    triggers: [{ event: BULK_SEND_REQUESTED }],
    // One batch per mailbox at a time so two batches can't double the send rate.
    concurrency: { key: "event.data.accountId", limit: 1 },
    retries: 2,
    onFailure: async ({ event, error }) => {
      const bulkSendId = Number(event.data.event.data?.bulkSendId);
      console.error(`[bulk send ${bulkSendId}] run failed:`, error.message);
      if (bulkSendId) await markBulkSendFailed(bulkSendId);
    },
  },
  async ({ event, step }) => {
    const bulkSendId = Number(event.data.bulkSendId);
    // Replies are only read on sync, and the send step skips leads who replied.
    await step.run("sync-replies", () => syncMailbox(Number(event.data.userId), Number(event.data.accountId)));

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const result = await step.run(`send-${round}`, () => sendNextRecipient(bulkSendId));
      if (result.done) return { bulkSendId, rounds: round + 1 };
      if (result.resumeAt) {
        // One run per sending day, so a batch can span weeks without reaching
        // Inngest's limits. The next run picks up from the database.
        await step.sleepUntil("wait-for-window", result.resumeAt);
        await step.sendEvent("continue-batch", {
          id: `bulk-${bulkSendId}-${result.resumeAt}`,
          name: BULK_SEND_REQUESTED,
          data: event.data,
        });
        return { bulkSendId, resumedAt: result.resumeAt };
      }
      const wait = result.rateLimited ? RATE_LIMIT_WAIT : result.waitSeconds ? `${result.waitSeconds}s` : SEND_GAP;
      await step.sleep(`wait-${round}`, wait);
    }
    await step.run("give-up", () => markBulkSendFailed(bulkSendId));
    return { bulkSendId, exhausted: true };
  }
);
