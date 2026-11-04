// How much bulk mail a mailbox may send as it ages. Pure so the send sheet can
// estimate with the same rules the server enforces.
import { DateTime, IANAZone } from "luxon";

export const DEFAULT_TIMEZONE = "Africa/Lagos";
export const WARMUP_DAYS = 28;
export const MIN_SEND_GAP_SECONDS = 150;

const WINDOW_START_HOUR = 8;
const WINDOW_END_HOUR = 18;
const MAX_DAILY_CAP = 50;
const GMAIL_DAILY_CAP = 30;
const MAX_ESTIMATE_DAYS = 365;

type WarmupMailbox = { createdAt: Date | string; provider: string; timezone: string };

export function isValidTimezone(zone: unknown): zone is string {
  return typeof zone === "string" && zone.length <= 64 && IANAZone.isValidZone(zone);
}

function local(at: Date | string, zone: string) {
  return (typeof at === "string" ? DateTime.fromISO(at) : DateTime.fromJSDate(at)).setZone(zone);
}

function isSendingDay(day: DateTime) {
  return day.weekday <= 5;
}

// `day` is 1 on the day the mailbox was connected.
export function capForAge(day: number, provider: string) {
  const cap = day <= 3 ? 5 : day <= 7 ? 10 : day <= 14 ? 15 : day <= 21 ? 25 : day <= WARMUP_DAYS ? 35 : MAX_DAILY_CAP;
  return provider === "gmail" ? Math.min(cap, GMAIL_DAILY_CAP) : cap;
}

export function mailboxDay(mailbox: WarmupMailbox, now: Date) {
  const start = local(mailbox.createdAt, mailbox.timezone).startOf("day");
  const today = local(now, mailbox.timezone).startOf("day");
  return Math.max(1, Math.round(today.diff(start, "days").days) + 1);
}

export function warmupStatus(mailbox: WarmupMailbox, sentToday: number, now: Date) {
  const day = mailboxDay(mailbox, now);
  const cap = capForAge(day, mailbox.provider);
  return { day, cap, sentToday, remainingToday: Math.max(0, cap - sentToday), warmed: day > WARMUP_DAYS };
}

export function startOfLocalDay(now: Date, zone: string) {
  return local(now, zone).startOf("day").toJSDate();
}

export function inSendWindow(now: Date, zone: string) {
  const at = local(now, zone);
  return isSendingDay(at) && at.hour >= WINDOW_START_HOUR && at.hour < WINDOW_END_HOUR;
}

// The next opening strictly after `now`, so it also answers "when can a mailbox
// that used up today's cap send again".
export function nextWindowStart(now: Date, zone: string) {
  const at = local(now, zone);
  let start = at.set({ hour: WINDOW_START_HOUR, minute: 0, second: 0, millisecond: 0 });
  if (at.toMillis() >= start.toMillis()) start = start.plus({ days: 1 });
  while (!isSendingDay(start)) start = start.plus({ days: 1 });
  return start.toJSDate();
}

// Spreads the sends still possible today across what is left of the window.
export function sendGapSeconds(now: Date, zone: string, sendsLeftToday: number, random = Math.random()) {
  if (sendsLeftToday <= 0) return MIN_SEND_GAP_SECONDS;
  const at = local(now, zone);
  const windowEnd = at.set({ hour: WINDOW_END_HOUR, minute: 0, second: 0, millisecond: 0 });
  const secondsLeft = Math.max(0, windowEnd.diff(at, "seconds").seconds);
  const jitter = 0.8 + random * 0.4;
  return Math.max(MIN_SEND_GAP_SECONDS, Math.round((secondsLeft / sendsLeftToday) * jitter));
}

export function sendingDaysNeeded(mailbox: WarmupMailbox, count: number, sentToday: number, now: Date) {
  let cursor = local(now, mailbox.timezone);
  let left = count;
  let days = 0;
  let used = cursor.hour < WINDOW_END_HOUR ? sentToday : Number.POSITIVE_INFINITY;
  for (let i = 0; left > 0 && i < MAX_ESTIMATE_DAYS; i++) {
    if (isSendingDay(cursor)) {
      const available = capForAge(mailboxDay(mailbox, cursor.toJSDate()), mailbox.provider) - used;
      if (available > 0) {
        left -= available;
        days++;
      }
    }
    used = 0;
    cursor = cursor.plus({ days: 1 });
  }
  return days;
}

// Zoho's usage policy says Zoho Mail can't be used for bulk or automated email.
export function isRestrictedBulkHost(smtpHost: string) {
  return /(^|\.)zoho(mail)?\./i.test(smtpHost);
}
