import assert from "node:assert/strict";
import test from "node:test";
import { cleanAppPassword, isEmailAddress, isMailHost, normalizeEmail, normalizeMessageId, plainBody } from "./text.ts";
import { safeMailError } from "./errors.ts";

test("normalizeEmail lowercases and trims", () => {
  assert.equal(normalizeEmail("  Ada@Shop.com "), "ada@shop.com");
  assert.equal(normalizeEmail(null), "");
});

test("isEmailAddress rejects blanks and accepts a normal address", () => {
  assert.equal(isEmailAddress("ada@shop.com"), true);
  assert.equal(isEmailAddress("not an email"), false);
  assert.equal(isEmailAddress(""), false);
});

test("isMailHost rejects urls and accepts a hostname", () => {
  assert.equal(isMailHost("smtp.zoho.com"), true);
  assert.equal(isMailHost("smtp.gmail.com"), true);
  assert.equal(isMailHost("https://smtp.zoho.com"), false);
  assert.equal(isMailHost("localhost"), false);
});

test("cleanAppPassword removes the spaces Google inserts", () => {
  assert.equal(cleanAppPassword("abcd efgh ijkl mnop"), "abcdefghijklmnop");
});

test("normalizeMessageId strips brackets", () => {
  assert.equal(normalizeMessageId("<abc@mail.gmail.com>"), "abc@mail.gmail.com");
  assert.equal(normalizeMessageId(""), "");
});

test("plainBody prefers text and falls back to html", () => {
  assert.equal(plainBody("Hello there", "<p>ignored</p>"), "Hello there");
  assert.equal(plainBody("", "<p>Hello<br>there</p>"), "Hello\nthere");
  assert.equal(plainBody("", ""), "");
});

test("safeMailError hides server details", () => {
  assert.match(safeMailError(new Error("535 5.7.8 secret-password")), /app password/i);
  assert.match(safeMailError(new Error("connect ETIMEDOUT")), /did not respond/i);
  assert.equal(safeMailError(new Error("something odd")), "Could not connect to that mailbox.");
});
