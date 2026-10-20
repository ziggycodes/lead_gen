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

function normText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

// Every identity a lead can share with another. A blank email or phone is not
// a key. Location is name + city + state, and only when the name and at least
// one of city or state is present, so the same city does not collapse
// different businesses.
export function dedupeKeys(lead) {
  if (!lead || typeof lead !== "object") return [];
  const keys = [];
  const email = normalizeEmail(lead.email);
  if (email.includes("@")) keys.push(`e:${email}`);
  const phone = String(lead.phone ?? "").replace(/\D/g, "");
  if (phone) keys.push(`p:${phone}`);
  const name = normText(lead.name);
  const city = normText(lead.city);
  const state = normText(lead.state);
  if (name && (city || state)) keys.push(`l:${name}|${city}|${state}`);
  return keys;
}

// Merge new leads into the seen-set, skipping any lead that shares an email,
// phone, or location with one already kept. Mutates `seen`.
export function dedupe(leads, seen) {
  const out = [];
  for (const lead of leads) {
    const keys = dedupeKeys(lead);
    if (keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    out.push(lead);
  }
  return out;
}

// After a scrape fills in an email, keep the lead unless that address was
// already claimed. `before` is the address at dedupe time, so a lead that
// already owned the address is not treated as a new claim. Mutates `seen`.
export function claimNewEmail(lead, seen, before) {
  const after = normalizeEmail(lead && lead.email);
  const prior = normalizeEmail(before);
  if (!after || after === prior) return true;
  const key = `e:${after}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}
