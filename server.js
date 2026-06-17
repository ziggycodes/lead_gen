// Local web server for the Lead-Gen tool. Serves the dashboard UI and exposes a
// small API that reuses the same core pipeline as the CLI (src/runSearch.js).
//
//   npm run web   ->   http://localhost:3000

import "./src/loadEnv.js";
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NICHES, listNicheKeys } from "./src/niches.js";
import { US_STATES, listStateIsoCodes } from "./src/usStates.js";
import { runSearch } from "./src/runSearch.js";
import { leadsToBuffer } from "./src/output.js";
import { publicConfig } from "./src/enrich.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// In-memory store of the most recent result so the download endpoint can serve it.
// (Single-user localhost tool; fine to keep in memory.)
let lastLeads = [];

// Metadata for populating the UI controls.
app.get("/api/niches", (req, res) => {
  res.json(
    listNicheKeys().map((key) => ({
      key,
      label: NICHES[key].label,
      category: NICHES[key].category,
    }))
  );
});

app.get("/api/states", (req, res) => {
  res.json(listStateIsoCodes().map((iso) => ({ iso, name: US_STATES[iso] })));
});

// Enrichment tier + connection status (no secrets exposed).
app.get("/api/config", (req, res) => {
  res.json(publicConfig());
});

// Streaming search via Server-Sent Events. Enrichment auto-runs when API keys are in .env.
app.get("/api/search", async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();

  let cancelled = false;
  req.on("close", () => {
    cancelled = true;
  });

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const { niches = "", states = "", limit = "2000", delay = "1000" } = req.query;

  try {
    const { leads, summary } = await runSearch(
      {
        niches,
        states,
        limit,
        delayMs: parseInt(delay, 10) || 0,
      },
      {
        onLog: (msg) => send("log", { msg }),
        onProgress: (p) => send("progress", p),
        onEnrichProgress: (p) => send("enrichProgress", p),
        isCancelled: () => cancelled,
      }
    );

    lastLeads = leads;
    send("done", { summary, leads });
  } catch (err) {
    send("error", { message: err.message });
  } finally {
    res.end();
  }
});

// Download the most recent results as CSV or XLSX.
app.get("/api/download", async (req, res) => {
  if (!lastLeads.length) {
    res.status(404).json({ error: "No results to download yet. Run a search first." });
    return;
  }
  const format = (req.query.format || "csv").toString().toLowerCase();
  try {
    const { buffer, contentType, filename } = await leadsToBuffer(lastLeads, format);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  process.stdout.write(`\nLead-Gen web tool running at http://localhost:${PORT}\n`);
});
