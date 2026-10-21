import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { admitWithinEmailCap, countEmailLeads, leadHasEmail } from "./emailCap.js";

describe("leadHasEmail", () => {
  it("accepts a trimmed address", () => {
    assert.equal(leadHasEmail({ email: " hi@shop.com " }), true);
  });

  it("rejects a blank or missing address", () => {
    assert.equal(leadHasEmail({ email: "  ", phone: "1" }), false);
    assert.equal(leadHasEmail({ phone: "1" }), false);
    assert.equal(leadHasEmail(null), false);
  });
});

describe("admitWithinEmailCap", () => {
  const email = (address) => ({ email: address, phone: "" });
  const phone = () => ({ email: "", phone: "512-555-0100" });

  it("keeps everything when there is no cap", () => {
    const batch = [email("a@x.com"), phone(), email("b@x.com")];
    const admitted = admitWithinEmailCap(batch, null, 0);
    assert.equal(admitted.capped, false);
    assert.equal(admitted.keep.length, 3);
    assert.equal(admitted.emails, 2);
  });

  it("keeps phone-only leads and drops emails past the remaining allowance", () => {
    const batch = [email("a@x.com"), phone(), email("b@x.com"), phone(), email("c@x.com")];
    const admitted = admitWithinEmailCap(batch, 1, 0);
    assert.equal(admitted.capped, true);
    assert.deepEqual(
      admitted.keep.map((lead) => lead.email || lead.phone),
      ["a@x.com", "512-555-0100", "512-555-0100"]
    );
    assert.equal(countEmailLeads(admitted.keep), 1);
  });

  it("counts emails already kept earlier in the search", () => {
    const admitted = admitWithinEmailCap([email("b@x.com"), phone()], 2, 2);
    assert.equal(admitted.capped, true);
    assert.equal(admitted.keep.length, 1);
    assert.equal(admitted.keep[0].phone, "512-555-0100");
  });

  it("does not treat a full budget as a cap when the batch has no emails", () => {
    const admitted = admitWithinEmailCap([phone()], 0, 0);
    assert.equal(admitted.capped, false);
    assert.equal(admitted.keep.length, 1);
  });
});
