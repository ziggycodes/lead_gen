import { Inngest } from "inngest";

// Locally, set INNGEST_DEV=1 and run `npx inngest-cli@latest dev`. On Vercel the
// Inngest integration sets INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY.
export const inngest = new Inngest({ id: "leadscout" });

export const SEARCH_REQUESTED = "leadscout/search.requested";
