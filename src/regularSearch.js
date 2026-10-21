// A regular search walks every niche in a fresh order and keeps only a few
// leads from each, so the 20-lead day is a mix instead of the first catalog entry.

export const REGULAR_PER_NICHE = 2;

export function shuffle(items, random = Math.random) {
  const next = Array.isArray(items) ? items.slice() : [];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = next[i];
    next[i] = next[j];
    next[j] = swap;
  }
  return next;
}

export function planRegularSearch({ nicheKeys, stateCodes, remaining, random = Math.random }) {
  const niches = shuffle(nicheKeys, random);
  const states = Array.isArray(stateCodes) ? stateCodes.filter(Boolean) : [];
  const state = states.length ? states[Math.floor(random() * states.length)] : "";
  const limit = Math.max(0, Math.floor(Number(remaining) || 0));
  return { niches, state, perNicheLimit: REGULAR_PER_NICHE, limit };
}
