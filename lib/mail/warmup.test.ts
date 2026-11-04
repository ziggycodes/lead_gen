import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_SEND_GAP_SECONDS,
  capForAge,
  inSendWindow,
  isRestrictedBulkHost,
  isValidTimezone,
  mailboxDay,
  nextWindowStart,
  sendGapSeconds,
  sendingDaysNeeded,
  warmupStatus,
} from "./warmup.ts";

const LONDON = "Europe/London";
const business = (createdAt: string) => ({ createdAt, provider: "business", timezone: "UTC" });

test("capForAge rises at each ramp boundary", () => {
  const caps = [1, 3, 4, 7, 8, 14, 15, 21, 22, 28, 29].map((day) => capForAge(day, "business"));
  assert.deepEqual(caps, [5, 5, 10, 10, 15, 15, 25, 25, 35, 35, 50]);
});

test("capForAge holds personal Gmail at 30", () => {
  assert.equal(capForAge(21, "gmail"), 25);
  assert.equal(capForAge(22, "gmail"), 30);
  assert.equal(capForAge(100, "gmail"), 30);
});

test("mailboxDay counts calendar days in the mailbox timezone", () => {
  const mailbox = { createdAt: "2026-11-02T23:30:00Z", provider: "business", timezone: "Africa/Lagos" };
  assert.equal(mailboxDay(mailbox, new Date("2026-11-03T06:00:00Z")), 1);
  assert.equal(mailboxDay(mailbox, new Date("2026-11-03T23:30:00Z")), 2);
});

test("mailboxDay is not thrown off by a clock change", () => {
  const mailbox = { createdAt: "2026-03-28T12:00:00Z", provider: "business", timezone: LONDON };
  assert.equal(mailboxDay(mailbox, new Date("2026-03-30T12:00:00Z")), 3);
});

test("warmupStatus reports what is left today and never goes negative", () => {
  const status = warmupStatus(business("2026-11-02T09:00:00Z"), 7, new Date("2026-11-02T12:00:00Z"));
  assert.deepEqual(status, { day: 1, cap: 5, sentToday: 7, remainingToday: 0, warmed: false });
  assert.equal(warmupStatus(business("2026-01-01T09:00:00Z"), 0, new Date("2026-11-02T12:00:00Z")).warmed, true);
});

test("inSendWindow covers 08:00 up to 18:00 on weekdays", () => {
  assert.equal(inSendWindow(new Date("2026-11-02T07:59:00Z"), "UTC"), false);
  assert.equal(inSendWindow(new Date("2026-11-02T08:00:00Z"), "UTC"), true);
  assert.equal(inSendWindow(new Date("2026-11-02T17:59:00Z"), "UTC"), true);
  assert.equal(inSendWindow(new Date("2026-11-02T18:00:00Z"), "UTC"), false);
  assert.equal(inSendWindow(new Date("2026-11-07T12:00:00Z"), "UTC"), false);
});

test("nextWindowStart opens today before the window and tomorrow once it has started", () => {
  assert.equal(nextWindowStart(new Date("2026-11-02T06:00:00Z"), "UTC").toISOString(), "2026-11-02T08:00:00.000Z");
  assert.equal(nextWindowStart(new Date("2026-11-02T12:00:00Z"), "UTC").toISOString(), "2026-11-03T08:00:00.000Z");
});

test("nextWindowStart rolls over the weekend", () => {
  assert.equal(nextWindowStart(new Date("2026-11-06T12:00:00Z"), "UTC").toISOString(), "2026-11-09T08:00:00.000Z");
  assert.equal(nextWindowStart(new Date("2026-11-07T06:00:00Z"), "UTC").toISOString(), "2026-11-09T08:00:00.000Z");
});

test("nextWindowStart keeps local 08:00 across a clock change", () => {
  // London moves to UTC+1 on Sunday 29 March 2026, so 08:00 local becomes 07:00 UTC.
  assert.equal(nextWindowStart(new Date("2026-03-27T12:00:00Z"), LONDON).toISOString(), "2026-03-30T07:00:00.000Z");
});

test("sendGapSeconds spreads sends across the rest of the window", () => {
  const now = new Date("2026-11-02T08:00:00Z");
  // 10 hours over 5 sends with no jitter (random 0.5) is 2 hours each.
  assert.equal(sendGapSeconds(now, "UTC", 5, 0.5), 7200);
  assert.equal(sendGapSeconds(now, "UTC", 5, 0), 5760);
  assert.equal(sendGapSeconds(now, "UTC", 5, 1), 8640);
});

test("sendGapSeconds never goes below the minimum gap", () => {
  assert.equal(sendGapSeconds(new Date("2026-11-02T08:00:00Z"), "UTC", 500, 0), MIN_SEND_GAP_SECONDS);
  assert.equal(sendGapSeconds(new Date("2026-11-02T20:00:00Z"), "UTC", 5, 0.5), MIN_SEND_GAP_SECONDS);
  assert.equal(sendGapSeconds(new Date("2026-11-02T08:00:00Z"), "UTC", 0, 0.5), MIN_SEND_GAP_SECONDS);
});

test("sendingDaysNeeded uses what is left today, then later caps", () => {
  // Monday 2 Nov, day 1. Today 5, Tue 5, Wed 5, Thu 10: 25 emails takes 4 sending days.
  const mailbox = business("2026-11-02T07:00:00Z");
  const monday = new Date("2026-11-02T09:00:00Z");
  assert.equal(sendingDaysNeeded(mailbox, 5, 0, monday), 1);
  assert.equal(sendingDaysNeeded(mailbox, 6, 0, monday), 2);
  assert.equal(sendingDaysNeeded(mailbox, 25, 0, monday), 4);
  // Today's cap is already used, so all 5 go out on Tuesday.
  assert.equal(sendingDaysNeeded(mailbox, 5, 5, monday), 1);
});

test("sendingDaysNeeded skips today once the window has closed, and weekends", () => {
  const mailbox = business("2026-01-01T07:00:00Z");
  assert.equal(sendingDaysNeeded(mailbox, 50, 0, new Date("2026-11-02T19:00:00Z")), 1);
  // Friday evening: 100 emails goes out over Monday and Tuesday.
  assert.equal(sendingDaysNeeded(mailbox, 100, 0, new Date("2026-11-06T19:00:00Z")), 2);
  assert.equal(sendingDaysNeeded(mailbox, 0, 0, new Date("2026-11-02T09:00:00Z")), 0);
});

test("isValidTimezone accepts IANA names only", () => {
  assert.equal(isValidTimezone("Africa/Lagos"), true);
  assert.equal(isValidTimezone("Mars/Base"), false);
  assert.equal(isValidTimezone(42), false);
});

test("isRestrictedBulkHost matches Zoho hosts, not lookalikes", () => {
  assert.equal(isRestrictedBulkHost("smtp.zoho.com"), true);
  assert.equal(isRestrictedBulkHost("smtp.zoho.eu"), true);
  assert.equal(isRestrictedBulkHost("smtp.zohomail.com"), true);
  assert.equal(isRestrictedBulkHost("smtp.gmail.com"), false);
  assert.equal(isRestrictedBulkHost("mail.notzoho.com"), false);
});
