import { eq } from "drizzle-orm";
import { db, schema } from "./db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) return null;
  return email;
}

export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const email = normalizeEmail(part);
    if (email) seen.add(email);
  }
  return [...seen];
}

export function isAccessGateEnabled(): boolean {
  return adminEmails().length > 0;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return adminEmails().includes(normalized);
}

export async function isEmailAllowed(email: string | null | undefined): Promise<boolean> {
  if (!isAccessGateEnabled()) return true;
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (isAdminEmail(normalized)) return true;

  const row = await db().query.allowedEmails.findFirst({
    where: eq(schema.allowedEmails.email, normalized),
    columns: { email: true },
  });
  return Boolean(row);
}
