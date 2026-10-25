import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchNiche } from "./runSearch.js";

const niche = { key: "dentist", label: "Dental Practice", filters: [{ k: "amenity", v: "dentist" }] };

function element(id, tags) {
  return { type: "node", id, lat: 30, lon: -97, tags: { "addr:city": "Austin", ...tags } };
}

// A cache that always hits, so these tests never reach Overpass.
function cacheWith(elements) {
  return { get: async () => elements, set: async () => {} };
}

describe("searchNiche", () => {
  it("returns contactable leads up to room and reports a cache hit", async () => {
    const elements = [
      element(1, { name: "A Dental", phone: "512-555-0001" }),
      element(2, { name: "No Contact Dental" }),
      element(3, { name: "B Dental", email: "hi@b.example" }),
      element(4, { name: "C Dental", phone: "512-555-0004" }),
    ];
    const seen = new Set();
    const result = await searchNiche({
      stateIso: "US-TX",
      niche,
      room: 2,
      seen,
      opts: { cache: cacheWith(elements), scrapeContacts: false },
    });
    assert.equal(result.fromCache, true);
    assert.deepEqual(
      result.leads.map((l) => l.name),
      ["A Dental", "B Dental"]
    );
  });

  it("skips businesses another step already claimed", async () => {
    const elements = [
      element(1, { name: "A Dental", phone: "512-555-0001" }),
      element(2, { name: "B Dental", phone: "512-555-0002" }),
    ];
    const seen = new Set(["p:5125550001"]);
    const result = await searchNiche({
      stateIso: "US-TX",
      niche,
      room: 5,
      seen,
      opts: { cache: cacheWith(elements), scrapeContacts: false },
    });
    assert.deepEqual(
      result.leads.map((l) => l.name),
      ["B Dental"]
    );
    assert.ok(seen.has("p:5125550002"));
  });
});
