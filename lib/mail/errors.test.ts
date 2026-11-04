import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SEND_ATTEMPTS, retryDelaySeconds } from "./bulkRules.ts";
import { MailboxAuthError, TemporarySendError, isTemporarySendFailure } from "./errors.ts";

test("connection errors are temporary only during the check before sending", () => {
  for (const code of ["ECONNECTION", "ESOCKET", "ETIMEDOUT", "EDNS"]) {
    assert.equal(isTemporarySendFailure({ code, command: "CONN" }, "check"), true);
    // Nodemailer reports a drop after the message was delivered exactly like this.
    assert.equal(isTemporarySendFailure({ code, command: "CONN" }, "send"), false);
  }
});

test("a 4xx reply is temporary at either stage", () => {
  assert.equal(isTemporarySendFailure({ code: "EAUTH", responseCode: 454 }, "check"), true);
  assert.equal(isTemporarySendFailure({ code: "EENVELOPE", responseCode: 421 }, "send"), true);
  assert.equal(isTemporarySendFailure({ code: "EMESSAGE", responseCode: 451 }, "send"), true);
});

test("permanent rejections are not temporary", () => {
  assert.equal(isTemporarySendFailure({ code: "EAUTH", responseCode: 535 }, "check"), false);
  assert.equal(isTemporarySendFailure({ code: "EENVELOPE", responseCode: 550 }, "send"), false);
  assert.equal(isTemporarySendFailure(new Error("boom"), "check"), false);
  assert.equal(isTemporarySendFailure(null, "send"), false);
});

test("TemporarySendError is still handled as a mailbox error by existing callers", () => {
  assert.ok(new TemporarySendError("x") instanceof MailboxAuthError);
});

test("retries wait 5 then 15 minutes within the attempt limit", () => {
  assert.equal(MAX_SEND_ATTEMPTS, 3);
  assert.equal(retryDelaySeconds(1), 300);
  assert.equal(retryDelaySeconds(2), 900);
});
