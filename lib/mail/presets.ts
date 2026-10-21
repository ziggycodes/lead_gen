export const GMAIL_HOSTS = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  imapHost: "imap.gmail.com",
  imapPort: 993,
} as const;

export const ZOHO_PREFILL = {
  smtpHost: "smtp.zoho.com",
  smtpPort: 587,
  imapHost: "imap.zoho.com",
  imapPort: 993,
} as const;

export type MailProvider = "gmail" | "business";

export function isMailProvider(value: unknown): value is MailProvider {
  return value === "gmail" || value === "business";
}
