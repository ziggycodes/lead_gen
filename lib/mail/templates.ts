import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { MailboxAuthError } from "./errors";

const MAX_TEMPLATES = 50;

export type TemplateInput = { name: string; subject: string; body: string };

export function cleanTemplateInput(body: unknown): TemplateInput {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : "";
  const subject = typeof raw.subject === "string" ? raw.subject.trim().slice(0, 200) : "";
  const text = typeof raw.body === "string" ? raw.body.trim().slice(0, 20_000) : "";
  if (!name) throw new MailboxAuthError("Give the template a name.");
  if (!subject) throw new MailboxAuthError("Add a subject.");
  if (!text) throw new MailboxAuthError("Write the template body.");
  return { name, subject, body: text };
}

export function listTemplates(userId: number) {
  return db().query.emailTemplates.findMany({
    where: eq(schema.emailTemplates.userId, userId),
    orderBy: [desc(schema.emailTemplates.updatedAt)],
  });
}

export async function ownedTemplate(userId: number, id: number) {
  const row = await db().query.emailTemplates.findFirst({
    where: and(eq(schema.emailTemplates.id, id), eq(schema.emailTemplates.userId, userId)),
  });
  return row ?? null;
}

export async function createTemplate(userId: number, input: TemplateInput) {
  const existing = await listTemplates(userId);
  if (existing.length >= MAX_TEMPLATES) throw new MailboxAuthError(`You can keep up to ${MAX_TEMPLATES} templates.`);
  const [row] = await db()
    .insert(schema.emailTemplates)
    .values({ userId, ...input })
    .returning();
  return row;
}

export async function updateTemplate(userId: number, id: number, input: TemplateInput) {
  const [row] = await db()
    .update(schema.emailTemplates)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(schema.emailTemplates.id, id), eq(schema.emailTemplates.userId, userId)))
    .returning();
  if (!row) throw new MailboxAuthError("Template not found.");
  return row;
}

export async function deleteTemplate(userId: number, id: number) {
  const rows = await db()
    .delete(schema.emailTemplates)
    .where(and(eq(schema.emailTemplates.id, id), eq(schema.emailTemplates.userId, userId)))
    .returning({ id: schema.emailTemplates.id });
  if (!rows.length) throw new MailboxAuthError("Template not found.");
}
