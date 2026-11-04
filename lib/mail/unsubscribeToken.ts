// Unsubscribe links carry an encrypted token so they can't be forged for another
// address and don't show the recipient's address in the URL.
import { decryptSecret, encryptSecret } from "./crypto.ts";

const PURPOSE = "unsubscribe";
const PRODUCTION_ORIGIN = "https://leadscout.nocodeziggy.com";

export function unsubscribeToken(userId: number, email: string) {
  const payload = JSON.stringify({ p: PURPOSE, u: userId, e: email });
  return Buffer.from(encryptSecret(payload), "base64").toString("base64url");
}

export function readUnsubscribeToken(token: string): { userId: number; email: string } | null {
  try {
    const parsed = JSON.parse(decryptSecret(Buffer.from(token, "base64url").toString("base64")));
    if (parsed?.p !== PURPOSE || !Number.isInteger(parsed.u) || typeof parsed.e !== "string") return null;
    return { userId: parsed.u, email: parsed.e };
  } catch {
    return null;
  }
}

function appOrigin() {
  if (process.env.VERCEL_ENV === "production") return PRODUCTION_ORIGIN;
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

// `page` is the link people click. `oneClick` is what mail apps POST to from
// their own Unsubscribe button (RFC 8058).
export function unsubscribeUrls(userId: number, email: string) {
  const token = unsubscribeToken(userId, email);
  return { page: `${appOrigin()}/unsubscribe/${token}`, oneClick: `${appOrigin()}/api/unsubscribe/${token}` };
}

export function unsubscribeFooter(pageUrl: string) {
  return `\n\n--\nDon't want these emails? Unsubscribe: ${pageUrl}`;
}

export function unsubscribeHeaders(oneClickUrl: string) {
  return {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
