// Normalizes raw Overpass elements into clean lead records, derives state/city,
// and de-duplicates.

import { ABBR_TO_NAME, stateNameFromIso } from "./usStates.js";

function firstTag(tags, keys) {
  for (const k of keys) {
    if (tags[k]) return tags[k];
  }
  return "";
}

function buildAddress(tags) {
  const parts = [];
  const house = tags["addr:housenumber"];
  const street = tags["addr:street"];
  if (house && street) parts.push(`${house} ${street}`);
  else if (street) parts.push(street);
  const city = tags["addr:city"];
  if (city) parts.push(city);
  const state = tags["addr:state"];
  if (state) parts.push(state);
  const zip = tags["addr:postcode"];
  if (zip) parts.push(zip);
  return parts.join(", ");
}

function deriveStateName(tags, fallbackIso) {
  const raw = tags["addr:state"];
  if (raw) {
    const upper = raw.trim().toUpperCase();
    if (ABBR_TO_NAME[upper]) return ABBR_TO_NAME[upper];
    return raw.trim();
  }
  return stateNameFromIso(fallbackIso);
}

// Convert a single Overpass element into a lead record (or null if not usable).
export function elementToLead(el, { niche, nicheLabel, stateIso }) {
  const tags = el.tags || {};
  const name = tags.name || tags["operator"] || "";
  if (!name) return null; // unnamed POIs are useless as leads

  const phone = firstTag(tags, ["phone", "contact:phone", "phone:mobile"]);
  const website = firstTag(tags, ["website", "contact:website", "url"]);
  const email = firstTag(tags, ["email", "contact:email"]);
  const lat = el.lat ?? el.center?.lat ?? null;
  const lon = el.lon ?? el.center?.lon ?? null;

  return {
    name: name.trim(),
    niche: nicheLabel,
    nicheKey: niche,
    state: deriveStateName(tags, stateIso),
    stateIso,
    city: tags["addr:city"] || "",
    phone: phone.trim(),
    website: website.trim(),
    email: email.trim(),
    address: buildAddress(tags),
    lat,
    lon,
    osmType: el.type,
    osmId: el.id,
    osmLink: el.type && el.id ? `https://www.openstreetmap.org/${el.type}/${el.id}` : "",
    _tags: tags,
  };
}

// Stable dedupe key: prefer name+city, fall back to name+state.
function dedupeKey(lead) {
  const base = lead.name.toLowerCase().replace(/\s+/g, " ").trim();
  const loc = (lead.city || lead.state || "").toLowerCase().trim();
  const phone = lead.phone.replace(/\D/g, "");
  return phone ? `p:${phone}` : `n:${base}|${loc}`;
}

// Merge new leads into the seen-set, skipping duplicates. Mutates `seen`.
export function dedupe(leads, seen) {
  const out = [];
  for (const lead of leads) {
    const key = dedupeKey(lead);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lead);
  }
  return out;
}
