import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { UNSUBSCRIBED_LABEL, planRecipients } from "./bulkRules.ts";
import { encryptSecret } from "./crypto.ts";
import { readUnsubscribeToken, unsubscribeHeaders, unsubscribeToken, unsubscribeUrls } from "./unsubscribeToken.ts";

process.env.EMAIL_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const lead = (id: number, email: string) => ({
  id,
  email,
  status: "new",
  name: `Lead ${id}`,
  contactName: "",
  city: "",
  state: "",
  niche: "",
});
const template = { subject: "Hi {{name}}", body: "Hello {{name}}" };

test("a token reads back to the address and account it was issued for", () => {
  const token = unsubscribeToken(7, "person@example.com");
  assert.deepEqual(readUnsubscribeToken(token), { userId: 7, email: "person@example.com" });
});

test("a token is URL safe and hides the address", () => {
  const token = unsubscribeToken(7, "person@example.com");
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(Buffer.from(token, "base64url").toString("latin1").includes("person@example.com"), false);
});

test("a tampered or made-up token is rejected", () => {
  const token = unsubscribeToken(7, "person@example.com");
  const tampered = (token[20] === "A" ? "B" : "A") + token.slice(1);
  assert.equal(readUnsubscribeToken(tampered), null);
  assert.equal(readUnsubscribeToken(token.slice(0, -4)), null);
  assert.equal(readUnsubscribeToken("not-a-token"), null);
  assert.equal(readUnsubscribeToken(""), null);
});

test("other data encrypted with the same key is not accepted as a token", () => {
  const mailboxSecret = Buffer.from(encryptSecret("app-password"), "base64").toString("base64url");
  const wrongPurpose = Buffer.from(encryptSecret(JSON.stringify({ p: "other", u: 7, e: "a@b.co" })), "base64").toString("base64url");
  assert.equal(readUnsubscribeToken(mailboxSecret), null);
  assert.equal(readUnsubscribeToken(wrongPurpose), null);
});

test("headers follow the one-click format mail apps look for", () => {
  assert.deepEqual(unsubscribeHeaders("https://x.test/api/unsubscribe/abc"), {
    "List-Unsubscribe": "<https://x.test/api/unsubscribe/abc>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
});

test("production links always use the real domain, whatever the app URL says", () => {
  const saved = { env: process.env.VERCEL_ENV, url: process.env.NEXT_PUBLIC_APP_URL };
  process.env.VERCEL_ENV = "production";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  const urls = unsubscribeUrls(7, "person@example.com");
  assert.ok(urls.page.startsWith("https://leadscout.nocodeziggy.com/unsubscribe/"));
  assert.ok(urls.oneClick.startsWith("https://leadscout.nocodeziggy.com/api/unsubscribe/"));
  process.env.VERCEL_ENV = saved.env ?? "";
  process.env.NEXT_PUBLIC_APP_URL = saved.url ?? "";
});

test("planRecipients skips unsubscribed addresses, ignoring case", () => {
  const plan = planRecipients([lead(1, "Gone@Example.com"), lead(2, "here@example.com")], template, new Set(["gone@example.com"]));
  assert.deepEqual(plan.send.map((l) => l.id), [2]);
  assert.deepEqual(plan.skip.map((s) => [s.lead.id, s.reason]), [[1, UNSUBSCRIBED_LABEL]]);
});
