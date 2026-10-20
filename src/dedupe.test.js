import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { claimNewEmail, dedupe } from "./parse.js";

function lead(overrides) {
  return {
    name: "Acme Dental",
    city: "Austin",
    state: "Texas",
    phone: "",
    email: "",
    ...overrides,
  };
}

describe("dedupe", () => {
  it("drops a lead that shares an email", () => {
    const seen = new Set();
    const kept = dedupe(
      [
        lead({ name: "North Dental", email: "info@shop.com", phone: "111" }),
        lead({ name: "South Dental", email: "INFO@shop.com", phone: "222", city: "Dallas" }),
      ],
      seen
    );
    assert.deepEqual(kept.map((row) => row.name), ["North Dental"]);
  });

  it("drops a lead that shares a phone number written differently", () => {
    const seen = new Set();
    const kept = dedupe(
      [
        lead({ phone: "(512) 555-0100", email: "a@shop.com" }),
        lead({ name: "Other Dental", city: "Dallas", phone: "5125550100", email: "b@shop.com" }),
      ],
      seen
    );
    assert.deepEqual(kept.map((row) => row.name), ["Acme Dental"]);
  });

  it("drops a lead with the same name, city, and state", () => {
    const seen = new Set();
    const kept = dedupe(
      [
        lead({ phone: "111", email: "a@shop.com" }),
        lead({ phone: "222", email: "b@shop.com" }),
      ],
      seen
    );
    assert.equal(kept.length, 1);
  });

  it("keeps different businesses in the same city", () => {
    const seen = new Set();
    const kept = dedupe(
      [
        lead({ name: "North Dental", phone: "111" }),
        lead({ name: "South Dental", phone: "222" }),
      ],
      seen
    );
    assert.equal(kept.length, 2);
  });

  it("does not treat a blank email or phone as a match", () => {
    const seen = new Set();
    const kept = dedupe(
      [
        lead({ name: "North Dental", city: "Austin", phone: "", email: "  " }),
        lead({ name: "South Dental", city: "Dallas", phone: "", email: "" }),
      ],
      seen
    );
    assert.equal(kept.length, 2);
  });

  it("keeps a named business that has no city or state", () => {
    const seen = new Set();
    const kept = dedupe(
      [
        lead({ name: "Acme", city: "", state: "", phone: "", email: "" }),
        lead({ name: "Acme", city: "", state: "", phone: "", email: "" }),
      ],
      seen
    );
    assert.equal(kept.length, 2);
  });
});

describe("claimNewEmail", () => {
  it("drops a lead whose scraped email was already claimed", () => {
    const seen = new Set(["e:info@shop.com"]);
    const row = lead({ email: "info@shop.com" });
    assert.equal(claimNewEmail(row, seen, ""), false);
  });

  it("claims a new scraped email", () => {
    const seen = new Set();
    const row = lead({ email: "info@shop.com" });
    assert.equal(claimNewEmail(row, seen, ""), true);
    assert.equal(seen.has("e:info@shop.com"), true);
  });

  it("keeps a lead that already owned its email", () => {
    const seen = new Set(["e:info@shop.com"]);
    const row = lead({ email: "info@shop.com" });
    assert.equal(claimNewEmail(row, seen, "info@shop.com"), true);
  });

  it("keeps a lead with no email", () => {
    assert.equal(claimNewEmail(lead({ email: "" }), new Set(), ""), true);
    assert.equal(claimNewEmail(null, new Set(), ""), true);
  });
});
