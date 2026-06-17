// Front-end logic for the LeadGen dashboard. Talks to the local Express API,
// streams progress over Server-Sent Events, and renders the results table.

const $ = (sel) => document.querySelector(sel);

const state = {
  niches: new Set(),
  leads: [],
  evtSource: null,
  config: null,
};

const TIER_LABELS = {
  basic: "Basic mode",
  llm: "LLM connected",
  "llm+ratings": "LLM + Google ratings",
  ratings: "Google ratings only",
};

function renderTierBadge(config) {
  const badge = $("#tier-badge");
  if (!badge || !config) return;
  badge.textContent = TIER_LABELS[config.tier] || "Basic mode";
  badge.className = "tier-badge tier-" + (config.tier || "basic").replace("+", "-plus");
  if (config.llm?.connected) {
    badge.title = `LLM: ${config.llm.provider} (${config.llm.model})`;
  } else {
    badge.title = "Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env for LLM enrichment";
  }
}

async function loadConfig() {
  state.config = await fetch("/api/config").then((r) => r.json());
  renderTierBadge(state.config);
}

// ---- Init: populate niches + states ----
async function init() {
  const [niches, states] = await Promise.all([
    fetch("/api/niches").then((r) => r.json()),
    fetch("/api/states").then((r) => r.json()),
  ]);
  await loadConfig();

  const nicheGrid = $("#niches");
  for (const n of niches) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = n.label;
    chip.dataset.key = n.key;
    chip.addEventListener("click", () => {
      if (state.niches.has(n.key)) {
        state.niches.delete(n.key);
        chip.classList.remove("active");
      } else {
        state.niches.add(n.key);
        chip.classList.add("active");
      }
    });
    nicheGrid.appendChild(chip);
  }
  for (const def of ["dentist", "salon", "plumber", "restaurant"]) {
    const chip = nicheGrid.querySelector(`[data-key="${def}"]`);
    if (chip) {
      chip.classList.add("active");
      state.niches.add(def);
    }
  }

  const select = $("#state-select");
  for (const s of states) {
    const opt = document.createElement("option");
    opt.value = s.iso;
    opt.textContent = s.name;
    select.appendChild(opt);
  }
}

$("#states-all").addEventListener("click", () => {
  for (const opt of $("#state-select").options) opt.selected = true;
});
$("#states-none").addEventListener("click", () => {
  for (const opt of $("#state-select").options) opt.selected = false;
});

function log(msg) {
  const el = $("#log");
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
}

function setRunning(running) {
  $("#run").disabled = running;
  $("#stop").disabled = !running;
  $("#progress-wrap").classList.toggle("hidden", !running);
}

function startSearch() {
  const niches = [...state.niches].join(",");
  if (!niches) {
    alert("Pick at least one niche.");
    return;
  }
  const selectedStates = [...$("#state-select").selectedOptions].map((o) => o.value);
  const states = selectedStates.length ? selectedStates.join(",") : "US";
  const limit = $("#limit").value || "500";
  const delay = $("#delay").value || "1000";

  state.leads = [];
  $("#leads-body").innerHTML = "";
  $("#log").textContent = "";
  $("#stats").innerHTML = "";
  $("#progress-fill").style.width = "0%";
  $("#progress-text").textContent = "Starting...";
  $("#dl-csv").disabled = true;
  $("#dl-xlsx").disabled = true;
  setRunning(true);

  const params = new URLSearchParams({ niches, states, limit, delay });
  const es = new EventSource("/api/search?" + params.toString());
  state.evtSource = es;

  es.addEventListener("log", (e) => log(JSON.parse(e.data).msg));

  es.addEventListener("progress", (e) => {
    const p = JSON.parse(e.data);
    const pct = Math.min(100, Math.round((p.step / p.totalSteps) * 100));
    $("#progress-fill").style.width = pct + "%";
    $("#progress-text").textContent =
      `${p.stateName} / ${p.niche} - ${p.total}/${p.limit} leads (${p.step}/${p.totalSteps} queries)`;
  });

  es.addEventListener("enrichProgress", (e) => {
    const p = JSON.parse(e.data);
    const pct = Math.min(100, Math.round((p.done / p.total) * 100));
    $("#progress-fill").style.width = pct + "%";
    $("#progress-text").textContent = `Enriching leads... ${p.done}/${p.total}`;
  });

  es.addEventListener("done", (e) => {
    const { summary, leads } = JSON.parse(e.data);
    state.leads = leads;
    renderResults(leads, summary);
    $("#progress-fill").style.width = "100%";
    let doneMsg = `Done - ${summary.total} leads collected (${summary.tier || "basic"} mode).`;
    if (summary.llmEnriched) doneMsg += ` ${summary.llmEnriched} LLM-enriched.`;
    if (summary.withRating) doneMsg += ` ${summary.withRating} with ratings.`;
    $("#progress-text").textContent = doneMsg;
    cleanup();
  });

  es.addEventListener("error", (e) => {
    try {
      const data = JSON.parse(e.data);
      log("ERROR: " + data.message);
    } catch {
      log("Connection closed.");
    }
    cleanup();
  });
}

function cleanup() {
  if (state.evtSource) {
    state.evtSource.close();
    state.evtSource = null;
  }
  setRunning(false);
  $("#progress-wrap").classList.remove("hidden");
}

$("#run").addEventListener("click", startSearch);
$("#stop").addEventListener("click", () => {
  log("Stopped by user.");
  cleanup();
});

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function fmtRating(v) {
  if (v === undefined || v === null || v === "") return "<span class='badge'>-</span>";
  return escapeHtml(v);
}

function renderResults(leads, summary) {
  const stats = $("#stats");
  let html =
    `<span class="stat"><b>${summary.total}</b> leads</span>` +
    `<span class="stat"><b>${summary.withPhone}</b> with phone</span>` +
    `<span class="stat"><b>${summary.withWebsite}</b> with website</span>`;
  if (summary.withRating) html += `<span class="stat"><b>${summary.withRating}</b> with ratings</span>`;
  if (summary.llmEnriched) html += `<span class="stat"><b>${summary.llmEnriched}</b> LLM-enriched</span>`;
  stats.innerHTML = html;

  $("#filter").classList.toggle("hidden", leads.length === 0);
  $("#dl-csv").disabled = leads.length === 0;
  $("#dl-xlsx").disabled = leads.length === 0;

  renderRows(leads);
}

function renderRows(leads) {
  const body = $("#leads-body");
  if (!leads.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="10">No matching results.</td></tr>`;
    return;
  }
  const rows = leads
    .map((l) => {
      const site = l.website
        ? `<a href="${escapeHtml(l.website)}" target="_blank" rel="noopener">link</a>`
        : "<span class='badge'>none</span>";
      const llmTag = l.llmEnriched ? " <span class='badge badge-llm'>AI</span>" : "";
      return `<tr>
        <td>${escapeHtml(l.name)}</td>
        <td>${escapeHtml(l.niche)}</td>
        <td>${escapeHtml(l.state)}</td>
        <td>${escapeHtml(l.city)}</td>
        <td>${escapeHtml(l.phone) || "<span class='badge'>none</span>"}</td>
        <td>${site}</td>
        <td>${fmtRating(l.rating)}</td>
        <td>${fmtRating(l.reviewCount)}</td>
        <td class="pain">${escapeHtml(l.painPoint)}${llmTag}</td>
        <td class="pitch">${escapeHtml(l.pitchAngle)}</td>
      </tr>`;
    })
    .join("");
  body.innerHTML = rows;
}

$("#filter").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) return renderRows(state.leads);
  const filtered = state.leads.filter((l) =>
    [l.name, l.niche, l.state, l.city, l.phone, l.painPoint, l.rating, l.reviewCount]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
  renderRows(filtered);
});

$("#dl-csv").addEventListener("click", () => (window.location.href = "/api/download?format=csv"));
$("#dl-xlsx").addEventListener("click", () => (window.location.href = "/api/download?format=xlsx"));

init().catch((err) => log("Init failed: " + err.message));
