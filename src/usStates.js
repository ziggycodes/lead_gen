// US states + DC keyed by their ISO 3166-2 code (as used by OSM admin areas).
export const US_STATES = {
  "US-AL": "Alabama",
  "US-AK": "Alaska",
  "US-AZ": "Arizona",
  "US-AR": "Arkansas",
  "US-CA": "California",
  "US-CO": "Colorado",
  "US-CT": "Connecticut",
  "US-DE": "Delaware",
  "US-DC": "District of Columbia",
  "US-FL": "Florida",
  "US-GA": "Georgia",
  "US-HI": "Hawaii",
  "US-ID": "Idaho",
  "US-IL": "Illinois",
  "US-IN": "Indiana",
  "US-IA": "Iowa",
  "US-KS": "Kansas",
  "US-KY": "Kentucky",
  "US-LA": "Louisiana",
  "US-ME": "Maine",
  "US-MD": "Maryland",
  "US-MA": "Massachusetts",
  "US-MI": "Michigan",
  "US-MN": "Minnesota",
  "US-MS": "Mississippi",
  "US-MO": "Missouri",
  "US-MT": "Montana",
  "US-NE": "Nebraska",
  "US-NV": "Nevada",
  "US-NH": "New Hampshire",
  "US-NJ": "New Jersey",
  "US-NM": "New Mexico",
  "US-NY": "New York",
  "US-NC": "North Carolina",
  "US-ND": "North Dakota",
  "US-OH": "Ohio",
  "US-OK": "Oklahoma",
  "US-OR": "Oregon",
  "US-PA": "Pennsylvania",
  "US-RI": "Rhode Island",
  "US-SC": "South Carolina",
  "US-SD": "South Dakota",
  "US-TN": "Tennessee",
  "US-TX": "Texas",
  "US-UT": "Utah",
  "US-VT": "Vermont",
  "US-VA": "Virginia",
  "US-WA": "Washington",
  "US-WV": "West Virginia",
  "US-WI": "Wisconsin",
  "US-WY": "Wyoming",
};

// Map a 2-letter postal abbreviation to its full name (for parsing addr:state tags).
export const ABBR_TO_NAME = Object.fromEntries(
  Object.entries(US_STATES).map(([iso, name]) => [iso.replace("US-", ""), name])
);

export function listStateIsoCodes() {
  return Object.keys(US_STATES);
}

// Resolve a user-supplied state token (e.g. "US-CA", "CA", "California") to an ISO code.
export function resolveStateInput(token) {
  const t = token.trim();
  if (US_STATES[t.toUpperCase()]) return t.toUpperCase();
  const upper = t.toUpperCase();
  if (ABBR_TO_NAME[upper]) return `US-${upper}`;
  const byName = Object.entries(US_STATES).find(
    ([, name]) => name.toLowerCase() === t.toLowerCase()
  );
  return byName ? byName[0] : null;
}

export function stateNameFromIso(iso) {
  return US_STATES[iso] || iso;
}
