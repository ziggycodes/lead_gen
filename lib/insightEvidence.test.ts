import assert from "node:assert/strict";
import test from "node:test";
import { verifiedEvidence } from "./insightEvidence.ts";

const site = "Bright Smile Dental\nNow open   Saturdays 9-2.\nInvisalign and same-day crowns.";

test("verifiedEvidence keeps quotes that appear on the site, ignoring case and spacing", () => {
  assert.deepEqual(verifiedEvidence(["now open saturdays", "\"Same-day crowns\""], site), [
    "now open saturdays",
    "Same-day crowns",
  ]);
});

test("verifiedEvidence drops invented or trivial quotes", () => {
  assert.deepEqual(verifiedEvidence(["4.9 stars on Google", "and", ""], site), []);
});
