import nodemailer from "nodemailer";
import { MailboxAuthError, safeMailError } from "./errors";

export type SmtpTarget = {
  address: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
};

const TIMEOUT_MS = 20_000;

function transport(target: SmtpTarget, password: string) {
  return nodemailer.createTransport({
    host: target.smtpHost,
    port: target.smtpPort,
    secure: target.smtpPort === 465,
    requireTLS: target.smtpPort !== 465,
    auth: { user: target.address, pass: password },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
}

export async function verifySmtp(target: SmtpTarget, password: string): Promise<void> {
  const client = transport(target, password);
  try {
    await client.verify();
  } catch (err) {
    throw new MailboxAuthError(safeMailError(err));
  } finally {
    client.close();
  }
}

export async function sendSmtp(input: {
  target: SmtpTarget;
  password: string;
  to: string;
  subject: string;
  text: string;
}): Promise<string> {
  const client = transport(input.target, input.password);
  const fromName = input.target.fromName.replace(/["<>]/g, "").trim();
  const from = fromName ? `"${fromName}" <${input.target.address}>` : input.target.address;
  try {
    const info = await client.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return typeof info.messageId === "string" ? info.messageId : "";
  } catch (err) {
    throw new MailboxAuthError(safeMailError(err));
  } finally {
    client.close();
  }
}
