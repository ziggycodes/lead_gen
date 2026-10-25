import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { searchJob } from "@/lib/inngest/searchJob";

// Each search step runs in its own request; this is the per-step ceiling.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions: [searchJob] });
