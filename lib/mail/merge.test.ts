import assert from "node:assert/strict";
import test from "node:test";
import { renderTemplate, templateFields } from "./merge.ts";

const lead = {
  name: "Bright Smile Dental",
  contactName: "",
  city: "Austin",
  state: "TX",
  niche: "dentist",
};

test("renderTemplate fills fields and uses fallbacks for blanks", () => {
  const out = renderTemplate(
    { subject: "Calls at {{name}}", body: "Hi {{contactName|there}},\nClinics in {{ city }} ..." },
    lead
  );
  assert.equal(out.subject, "Calls at Bright Smile Dental");
  assert.equal(out.body, "Hi there,\nClinics in Austin ...");
  assert.deepEqual(out.missing, []);
});

test("renderTemplate reports a blank field with no fallback", () => {
  const out = renderTemplate({ subject: "Hi", body: "Hi {{contactName}}," }, lead);
  assert.deepEqual(out.missing, ["contactName"]);
});

test("renderTemplate reports unknown fields", () => {
  const out = renderTemplate({ subject: "{{company}}", body: "x" }, lead);
  assert.deepEqual(out.missing, ["company"]);
});

test("AI fields only fill from a ready insight", () => {
  const template = { subject: "s", body: "{{aiOpener}}" };
  const insight = { opener: "Saw you added Saturday hours.", painPoint: "", pitch: "" };
  assert.equal(renderTemplate(template, { ...lead, insight, insightStatus: "ready" }).body, insight.opener);
  assert.deepEqual(
    renderTemplate(template, { ...lead, insight, insightStatus: "low_confidence" }).missing,
    ["aiOpener"]
  );
  assert.deepEqual(renderTemplate(template, lead).missing, ["aiOpener"]);
});

test("an empty fallback drops the line cleanly", () => {
  const out = renderTemplate({ subject: "s", body: "Hello\n\n{{aiPitch|}}\n\nThanks" }, lead);
  assert.equal(out.body, "Hello\n\nThanks");
  assert.deepEqual(out.missing, []);
});

test("templateFields lists every field used", () => {
  assert.deepEqual(templateFields({ subject: "{{name}}", body: "{{aiOpener|x}} {{name}}" }), ["name", "aiOpener"]);
});

test("planRecipients skips no-email, duplicates, closed stages, and missing fields", async () => {
  const { planRecipients } = await import("./bulkRules.ts");
  const template = { subject: "Hi {{name}}", body: "Hey {{contactName}}" };
  const base = { name: "A", contactName: "Sam", status: "new" };
  const leads = [
    { ...base, id: 1, email: "a@x.com" },
    { ...base, id: 2, email: "A@x.com " },
    { ...base, id: 3, email: "" },
    { ...base, id: 4, email: "b@x.com", status: "won" },
    { ...base, id: 5, email: "c@x.com", contactName: "" },
  ];
  const { send, skip } = planRecipients(leads, template);
  assert.deepEqual(send.map((l) => l.id), [1]);
  assert.deepEqual(
    skip.map((s) => [s.lead.id, s.reason]),
    [
      [2, "Duplicate address in this batch"],
      [3, "No email address"],
      [4, "Lead is won"],
      [5, "Missing {{contactName}}"],
    ]
  );
});
