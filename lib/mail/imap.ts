import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { MailboxAuthError, logMailFailure, safeMailError } from "./errors";
import { normalizeEmail, normalizeMessageId, plainBody } from "./text";

export type ImapTarget = {
  address: string;
  imapHost: string;
  imapPort: number;
};

const TIMEOUT_MS = 20_000;
const MAX_PER_FOLDER = 100;
const FIRST_SYNC_DAYS = 30;

export type FetchedMail = {
  messageId: string;
  direction: "inbound" | "outbound";
  counterparty: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  sentAt: Date;
};

function clientFor(target: ImapTarget, password: string) {
  return new ImapFlow({
    host: target.imapHost,
    port: target.imapPort,
    secure: target.imapPort !== 143,
    auth: { user: target.address, pass: password },
    logger: false,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
}

export async function verifyImap(target: ImapTarget, password: string): Promise<void> {
  const client = clientFor(target, password);
  try {
    await client.connect();
  } catch (err) {
    throw new MailboxAuthError(safeMailError(err));
  } finally {
    await client.logout().catch((err) => {
      logMailFailure("imap_logout_failed", err);
    });
  }
}

function coerceDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function addressList(value: unknown): { address?: string }[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const nested = value.flatMap((item) => addressList(item) || []);
    return nested.length ? nested : null;
  }
  if (typeof value === "object" && "value" in value) {
    return addressList((value as { value: unknown }).value);
  }
  if (typeof value === "object" && "address" in value) {
    return [value as { address?: string }];
  }
  return null;
}

function addressOf(entry: { address?: string } | undefined): string {
  return normalizeEmail(entry?.address || "");
}

function firstExternal(addresses: { address?: string }[] | undefined, own: string): string {
  for (const entry of addresses || []) {
    const email = addressOf(entry);
    if (email && email !== own) return email;
  }
  return "";
}

function sentMailboxPath(list: Awaited<ReturnType<ImapFlow["list"]>>): string | null {
  const special = list.find((box) => box.specialUse === "\\Sent");
  if (special) return special.path;
  const named = list.find((box) => /(^|\/)sent( mail| items)?$/i.test(box.path));
  return named?.path ?? null;
}

async function readFolder(
  client: ImapFlow,
  path: string,
  direction: "inbound" | "outbound",
  ownAddress: string,
  since: Date
): Promise<FetchedMail[]> {
  const lock = await client.getMailboxLock(path);
  try {
    const found = await client.search({ since }, { uid: true });
    const uids = Array.isArray(found) ? found.slice(-MAX_PER_FOLDER) : [];
    if (!uids.length) return [];

    const rows: FetchedMail[] = [];
    for await (const msg of client.fetch(
      uids,
      { envelope: true, source: true, internalDate: true, uid: true },
      { uid: true }
    )) {
      const parsed = msg.source ? await simpleParser(msg.source) : null;
      const fromList = addressList(parsed?.from) || msg.envelope?.from || [];
      const toList = addressList(parsed?.to) || msg.envelope?.to || [];
      const fromAddress = addressOf(fromList[0]);
      const toAddress = addressOf(toList[0]);
      const counterparty =
        direction === "inbound" ? firstExternal(fromList, ownAddress) : firstExternal(toList, ownAddress);
      if (!counterparty) continue;

      const messageId =
        normalizeMessageId(parsed?.messageId) || `uid-${direction}-${msg.uid}`;
      const sentAt =
        coerceDate(parsed?.date) || coerceDate(msg.envelope?.date) || coerceDate(msg.internalDate) || new Date();
      rows.push({
        messageId,
        direction,
        counterparty,
        fromAddress: fromAddress || ownAddress,
        toAddress: toAddress || counterparty,
        subject: (parsed?.subject || msg.envelope?.subject || "").replace(/\u0000/g, "").slice(0, 500),
        bodyText: plainBody(parsed?.text, typeof parsed?.html === "string" ? parsed.html : ""),
        sentAt,
      });
    }
    return rows;
  } finally {
    lock.release();
  }
}

export async function fetchMailboxMail(
  target: ImapTarget,
  password: string,
  lastSyncedAt: Date | null
): Promise<FetchedMail[]> {
  const since = lastSyncedAt ?? new Date(Date.now() - FIRST_SYNC_DAYS * 24 * 60 * 60 * 1000);
  const client = clientFor(target, password);
  const own = normalizeEmail(target.address);
  const timer = setTimeout(() => {
    client.close();
  }, TIMEOUT_MS);
  try {
    await client.connect();
    const boxes = await client.list();
    const inbox = boxes.find((box) => box.specialUse === "\\Inbox")?.path || "INBOX";
    const inbound = await readFolder(client, inbox, "inbound", own, since);
    const sentPath = sentMailboxPath(boxes);
    let outbound: FetchedMail[] = [];
    if (sentPath) {
      try {
        outbound = await readFolder(client, sentPath, "outbound", own, since);
      } catch (err) {
        logMailFailure("imap_sent_folder_failed", err);
      }
    }
    const seen = new Set<string>();
    const merged: FetchedMail[] = [];
    for (const row of [...inbound, ...outbound]) {
      if (seen.has(row.messageId)) continue;
      seen.add(row.messageId);
      merged.push(row);
    }
    return merged;
  } catch (err) {
    if (err instanceof MailboxAuthError) throw err;
    throw new MailboxAuthError(safeMailError(err));
  } finally {
    clearTimeout(timer);
    await client.logout().catch((err) => {
      logMailFailure("imap_logout_failed", err);
    });
  }
}
