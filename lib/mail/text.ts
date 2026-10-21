const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOST =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export function isEmailAddress(value: string): boolean {
  return value.length <= 320 && EMAIL.test(value);
}

export function isMailHost(value: string): boolean {
  return HOST.test(value);
}

export function normalizeMessageId(value: string | undefined | null): string {
  return (value || "").trim().replace(/^<|>$/g, "").slice(0, 500);
}

export function plainBody(text: string | undefined | null, html: string | undefined | null): string {
  const source = (text || "").trim() || stripHtml(html || "");
  return source.replace(/\u0000/g, "").slice(0, 20_000);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function cleanAppPassword(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

export function clampPort(value: unknown): number | null {
  const port = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}
