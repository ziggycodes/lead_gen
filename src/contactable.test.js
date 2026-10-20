import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isContactable, filterContactable } from "./contactable.js";

describe("isContactable", () => {
  it("accepts a lead with a phone", () => {
    assert.equal(isContactable({ phone: "512-555-0100", email: "" }), true);
  });

  it("accepts a lead with an email", () => {
    assert.equal(isContactable({ phone: "", email: "hi@example.com" }), true);
  });

  it("accepts a lead with both", () => {
    assert.equal(isContactable({ phone: "1", email: "a@b.c" }), true);
  });

  it("rejects website-only and empty records", () => {
    assert.equal(isContactable({ website: "https://x.com", phone: "", email: "" }), false);
    assert.equal(isContactable({ name: "Acme", phone: "  ", email: "  " }), false);
    assert.equal(isContactable(null), false);
    assert.equal(isContactable(undefined), false);
    assert.equal(isContactable("nope"), false);
  });
});

describe("filterContactable", () => {
  it("keeps only reachable leads and ignores non-arrays", () => {
    const kept = filterContactable([
      { name: "A", phone: "1", email: "" },
      { name: "B", phone: "", email: "" },
      { name: "C", phone: "", email: "c@x.com" },
      null,
    ]);
    assert.deepEqual(
      kept.map((l) => l.name),
      ["A", "C"]
    );
    assert.deepEqual(filterContactable(null), []);
  });
});
