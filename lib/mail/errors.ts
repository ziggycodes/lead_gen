export class MailboxAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailboxAuthError";
  }
}

// The mail server never took the message, so sending again can't duplicate it.
export class TemporarySendError extends MailboxAuthError {
  constructor(message: string) {
    super(message);
    this.name = "TemporarySendError";
  }
}

const CONNECTION_CODES = new Set(["ECONNECTION", "ESOCKET", "ETIMEDOUT", "EDNS"]);

// Nodemailer reports a dropped connection the same way at every stage, even
// after the server has the message. So a connection error only proves nothing
// was sent during the check before sending. A 4xx reply is safe at any stage:
// the server is saying it did not accept the message.
export function isTemporarySendFailure(err: unknown, stage: "check" | "send") {
  const { code, responseCode } = (err ?? {}) as { code?: unknown; responseCode?: unknown };
  if (typeof responseCode === "number" && responseCode >= 400 && responseCode < 500) return true;
  return stage === "check" && typeof code === "string" && CONNECTION_CODES.has(code);
}

export class SendLimitError extends Error {
  constructor() {
    super("This mailbox has sent 30 emails in the last hour. Wait before sending more.");
    this.name = "SendLimitError";
  }
}

// Turn a mail-server failure into a message that is safe to show. Server
// errors sometimes echo credentials, so the raw message stays in the logs only
// as an error name, never the message text.
export function safeMailError(err: unknown): string {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (msg.includes("timed out") || msg.includes("timeout") || msg.includes("etimedout")) {
    return "The mail server did not respond in time. Try again.";
  }
  if (
    msg.includes("auth") ||
    msg.includes("invalid credentials") ||
    msg.includes("535") ||
    msg.includes("534") ||
    msg.includes("authenticationfailed") ||
    msg.includes("application-specific password")
  ) {
    return "The mail server rejected that app password. Check the password, and for Gmail confirm IMAP is turned on.";
  }
  if (
    msg.includes("enotfound") ||
    msg.includes("econnrefused") ||
    msg.includes("certificate") ||
    msg.includes("ehostunreach")
  ) {
    return "Could not reach that mail server. Check the host name and port.";
  }
  return "Could not connect to that mailbox.";
}

export function logMailEvent(event: string, fields: Record<string, string | number | null>) {
  console.info(JSON.stringify({ event, ...fields }));
}

export function logMailFailure(event: string, err: unknown, fields: Record<string, string | number | null> = {}) {
  const detail = (err ?? {}) as { code?: unknown; command?: unknown; responseCode?: unknown };
  console.error(
    JSON.stringify({
      event,
      name: err instanceof Error ? err.name : "Error",
      code: detail.code,
      command: detail.command,
      responseCode: detail.responseCode,
      ...fields,
    })
  );
}
