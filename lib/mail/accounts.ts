import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { encryptSecret } from "./crypto";
import { MailboxAuthError, logMailEvent } from "./errors";
import { verifyImap } from "./imap";
import { GMAIL_HOSTS, type MailProvider } from "./presets";
import { verifySmtp } from "./smtp";
import { clampPort, cleanAppPassword, isEmailAddress, isMailHost, normalizeEmail } from "./text";

const MAX_MAILBOXES = 20;

export type PublicMailbox = {
  id: number;
  provider: MailProvider;
  address: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  status: string;
  lastError: string | null;
  isDefault: boolean;
  lastSyncedAt: string | null;
};

type AccountRow = typeof schema.emailAccounts.$inferSelect;

export function toPublicMailbox(row: AccountRow): PublicMailbox {
  return {
    id: row.id,
    provider: row.provider === "gmail" ? "gmail" : "business",
    address: row.address,
    fromName: row.fromName,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    status: row.status,
    lastError: row.lastError,
    isDefault: row.isDefault,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
  };
}

export async function listMailboxes(userId: number): Promise<PublicMailbox[]> {
  const rows = await db().query.emailAccounts.findMany({
    where: eq(schema.emailAccounts.userId, userId),
    orderBy: [desc(schema.emailAccounts.isDefault), asc(schema.emailAccounts.address)],
  });
  return rows.map(toPublicMailbox);
}

export async function ownedAccount(userId: number, accountId: number): Promise<AccountRow | null> {
  const row = await db().query.emailAccounts.findFirst({
    where: and(eq(schema.emailAccounts.id, accountId), eq(schema.emailAccounts.userId, userId)),
  });
  return row ?? null;
}

export type ConnectInput = {
  provider: MailProvider;
  address: string;
  fromName: string;
  appPassword: string;
  smtpHost?: string;
  smtpPort?: number;
  imapHost?: string;
  imapPort?: number;
};

function hostsFor(input: ConnectInput) {
  if (input.provider === "gmail") return { ...GMAIL_HOSTS };
  const smtpHost = (input.smtpHost || "").trim().toLowerCase();
  const imapHost = (input.imapHost || "").trim().toLowerCase();
  const smtpPort = clampPort(input.smtpPort);
  const imapPort = clampPort(input.imapPort);
  if (!isMailHost(smtpHost) || !isMailHost(imapHost) || smtpPort == null || imapPort == null) {
    throw new MailboxAuthError("Enter the SMTP and IMAP host names and ports from your email provider.");
  }
  if (imapPort === 143) {
    throw new MailboxAuthError("Use the encrypted IMAP port, usually 993.");
  }
  return { smtpHost, smtpPort, imapHost, imapPort };
}

export async function connectMailbox(userId: number, input: ConnectInput): Promise<PublicMailbox> {
  const address = normalizeEmail(input.address);
  const fromName = input.fromName.trim().slice(0, 120);
  const password = cleanAppPassword(input.appPassword);
  if (!isEmailAddress(address)) throw new MailboxAuthError("Enter a valid email address.");
  if (password.length < 8 || password.length > 128) {
    throw new MailboxAuthError("Enter the app password from your email provider.");
  }
  const hosts = hostsFor(input);
  const target = { address, fromName, ...hosts };

  await verifySmtp(target, password);
  await verifyImap(target, password);

  const existing = await db().query.emailAccounts.findFirst({
    where: and(eq(schema.emailAccounts.userId, userId), eq(schema.emailAccounts.address, address)),
  });
  const secretCiphertext = encryptSecret(password);
  const now = new Date();

  if (existing) {
    const [row] = await db()
      .update(schema.emailAccounts)
      .set({
        provider: input.provider,
        fromName,
        ...hosts,
        secretCiphertext,
        status: "connected",
        lastError: null,
        updatedAt: now,
      })
      .where(eq(schema.emailAccounts.id, existing.id))
      .returning();
    logMailEvent("mailbox_connected", { userId, accountId: row.id, provider: input.provider });
    return toPublicMailbox(row);
  }

  const current = await db().query.emailAccounts.findMany({
    where: eq(schema.emailAccounts.userId, userId),
    columns: { id: true, isDefault: true },
  });
  if (current.length >= MAX_MAILBOXES) {
    throw new MailboxAuthError("This account already has 20 mailboxes. Remove one before adding another.");
  }

  const [row] = await db()
    .insert(schema.emailAccounts)
    .values({
      userId,
      provider: input.provider,
      address,
      fromName,
      ...hosts,
      secretCiphertext,
      status: "connected",
      isDefault: current.length === 0 || !current.some((item) => item.isDefault),
    })
    .returning();
  logMailEvent("mailbox_connected", { userId, accountId: row.id, provider: input.provider });
  return toPublicMailbox(row);
}

export async function setDefaultMailbox(userId: number, accountId: number): Promise<PublicMailbox> {
  const row = await ownedAccount(userId, accountId);
  if (!row) throw new MailboxAuthError("Mailbox not found.");
  await db()
    .update(schema.emailAccounts)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(schema.emailAccounts.userId, userId));
  const [updated] = await db()
    .update(schema.emailAccounts)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(eq(schema.emailAccounts.id, row.id))
    .returning();
  return toPublicMailbox(updated);
}

export async function removeMailbox(userId: number, accountId: number): Promise<void> {
  const row = await ownedAccount(userId, accountId);
  if (!row) throw new MailboxAuthError("Mailbox not found.");
  await db().delete(schema.emailAccounts).where(eq(schema.emailAccounts.id, row.id));
  if (row.isDefault) {
    const next = await db().query.emailAccounts.findFirst({
      where: eq(schema.emailAccounts.userId, userId),
      orderBy: [asc(schema.emailAccounts.id)],
    });
    if (next) {
      await db()
        .update(schema.emailAccounts)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(schema.emailAccounts.id, next.id));
    }
  }
  logMailEvent("mailbox_removed", { userId, accountId: row.id, provider: row.provider });
}
