import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planRegularSearch, shuffle } from "./regularSearch.js";

describe("shuffle", () => {
  it("keeps every item", () => {
    const items = ["a", "b", "c", "d"];
    const shuffled = shuffle(items, () => 0);
    assert.deepEqual(shuffled.slice().sort(), items.slice().sort());
    assert.deepEqual(items, ["a", "b", "c", "d"]);
  });
});

describe("planRegularSearch", () => {
  it("uses every niche, one state, and the remaining lead count", () => {
    let call = 0;
    const random = () => {
      call += 1;
      return call === 1 ? 0.9 : 0;
    };
    const plan = planRegularSearch({
      nicheKeys: ["dentist", "salon", "plumber"],
      stateCodes: ["TX", "CA"],
      remaining: 7.8,
      random,
    });
    assert.deepEqual(plan.niches.slice().sort(), ["dentist", "plumber", "salon"]);
    assert.equal(plan.state, "TX");
    assert.equal(plan.perNicheLimit, 2);
    assert.equal(plan.limit, 7);
  });

  it("returns an empty state when none are available", () => {
    const plan = planRegularSearch({ nicheKeys: [], stateCodes: [], remaining: 20, random: () => 0 });
    assert.equal(plan.state, "");
    assert.equal(plan.limit, 20);
  });
});
