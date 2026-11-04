const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// Keeps only evidence that appears verbatim (ignoring case and spacing) in the
// site text, so a quote the model invented can't vouch for a draft.
export function verifiedEvidence(evidence: string[], siteText: string): string[] {
  const haystack = squash(siteText);
  return evidence
    .map((e) => e.trim().replace(/^["“]|["”]$/g, ""))
    .filter((e) => e.length >= 4 && haystack.includes(squash(e)))
    .slice(0, 3);
}
