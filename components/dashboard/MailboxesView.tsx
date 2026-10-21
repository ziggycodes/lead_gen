"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Building2, Mail } from "lucide-react";
import { ZOHO_PREFILL } from "@/lib/mail/presets";

type Mailbox = {
  id: number;
  provider: "gmail" | "business";
  address: string;
  fromName: string;
  status: string;
  lastError: string | null;
  isDefault: boolean;
};

type Connector = "gmail" | "business";

const fieldClass =
  "mt-1 w-full rounded-lg border border-line bg-oat px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:bg-panel";

async function readError(res: Response): Promise<string> {
  const json = await res.json().catch(() => ({}));
  return json.error || `Request failed (${res.status})`;
}

export function MailboxesView() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connector, setConnector] = useState<Connector | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [address, setAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [smtpHost, setSmtpHost] = useState<string>(ZOHO_PREFILL.smtpHost);
  const [smtpPort, setSmtpPort] = useState(String(ZOHO_PREFILL.smtpPort));
  const [imapHost, setImapHost] = useState<string>(ZOHO_PREFILL.imapHost);
  const [imapPort, setImapPort] = useState(String(ZOHO_PREFILL.imapPort));

  const load = useCallback(async () => {
    const res = await fetch("/api/email-accounts");
    if (!res.ok) throw new Error(await readError(res));
    const json = await res.json();
    setMailboxes(json.mailboxes || []);
  }, []);

  useEffect(() => {
    load()
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [load]);

  const openConnector = (next: Connector) => {
    setConnector(next);
    setStep(1);
    setFormError(null);
    setAddress("");
    setFromName("");
    setAppPassword("");
    setSmtpHost(ZOHO_PREFILL.smtpHost);
    setSmtpPort(String(ZOHO_PREFILL.smtpPort));
    setImapHost(ZOHO_PREFILL.imapHost);
    setImapPort(String(ZOHO_PREFILL.imapPort));
  };

  const save = async () => {
    if (!connector) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch("/api/email-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: connector,
          address,
          fromName,
          appPassword,
          ...(connector === "business" ? { smtpHost, smtpPort: Number(smtpPort), imapHost, imapPort: Number(imapPort) } : {}),
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      await load();
      setAppPassword("");
      setConnector(null);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const makeDefault = async (id: number) => {
    setError(null);
    const res = await fetch(`/api/email-accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    await load();
  };

  const remove = async (id: number) => {
    setError(null);
    const res = await fetch(`/api/email-accounts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    setConfirmRemove(null);
    await load();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <h1 className="font-display text-lg font-semibold tracking-tight text-fg">Mailboxes</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Each person connects their own. A mailbox saved here is only available on this login.
        </p>
      </div>

      <div className="scroll-thin flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => openConnector("gmail")}
            className="flex items-start gap-3 rounded-xl border border-line bg-oat px-4 py-3 text-left hover:border-accent"
          >
            <Mail className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="block text-sm font-semibold">Connect Gmail</span>
              <span className="mt-0.5 block text-xs text-muted">A personal @gmail.com address</span>
            </span>
          </button>
          <button
            onClick={() => openConnector("business")}
            className="flex items-start gap-3 rounded-xl border border-line bg-oat px-4 py-3 text-left hover:border-accent"
          >
            <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="block text-sm font-semibold">Connect a business email</span>
              <span className="mt-0.5 block text-xs text-muted">Zoho, or any mailbox with SMTP and IMAP</span>
            </span>
          </button>
        </div>

        {connector && (
          <section className="max-w-xl rounded-xl border border-line bg-panel px-4 py-4">
            {step === 1 ? (
              connector === "gmail" ? (
                <GmailGuide onContinue={() => setStep(2)} onClose={() => setConnector(null)} />
              ) : (
                <BusinessGuide onContinue={() => setStep(2)} onClose={() => setConnector(null)} />
              )
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
                className="space-y-3"
              >
                <h2 className="font-display text-base font-semibold">
                  {connector === "gmail" ? "Gmail details" : "Business mailbox details"}
                </h2>
                <label className="block text-sm">
                  <span className="text-xs font-medium text-muted">Email address</span>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} required className={fieldClass} />
                </label>
                <label className="block text-sm">
                  <span className="text-xs font-medium text-muted">From name</span>
                  <input
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="Ada at LeadScout"
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs font-medium text-muted">App password</span>
                  <input
                    value={appPassword}
                    onChange={(e) => setAppPassword(e.target.value)}
                    type="password"
                    autoComplete="new-password"
                    required
                    className={fieldClass}
                  />
                </label>
                {connector === "business" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-xs font-medium text-muted">SMTP host</span>
                      <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} required className={fieldClass} />
                    </label>
                    <label className="block text-sm">
                      <span className="text-xs font-medium text-muted">SMTP port</span>
                      <input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} required className={fieldClass} />
                    </label>
                    <label className="block text-sm">
                      <span className="text-xs font-medium text-muted">IMAP host</span>
                      <input value={imapHost} onChange={(e) => setImapHost(e.target.value)} required className={fieldClass} />
                    </label>
                    <label className="block text-sm">
                      <span className="text-xs font-medium text-muted">IMAP port</span>
                      <input value={imapPort} onChange={(e) => setImapPort(e.target.value)} required className={fieldClass} />
                    </label>
                  </div>
                )}
                {formError && <p className="text-sm text-danger">{formError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setFormError(null);
                    }}
                    className="rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-ink disabled:opacity-50"
                  >
                    {busy ? "Checking…" : "Save and verify"}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="max-w-xl">
          <h2 className="text-sm font-semibold">Connected</h2>
          {loading ? (
            <p className="mt-2 text-sm text-muted">Loading mailboxes…</p>
          ) : mailboxes.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No mailbox yet. Connect Gmail or a business address above.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {mailboxes.map((mailbox) => (
                <li key={mailbox.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{mailbox.address}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {mailbox.provider === "gmail" ? "Gmail" : "Business"}
                      {mailbox.fromName ? ` · ${mailbox.fromName}` : ""}
                      {mailbox.isDefault ? " · Default" : ""}
                    </p>
                    {mailbox.lastError && <p className="mt-1 text-xs text-danger">{mailbox.lastError}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {!mailbox.isDefault && (
                      <button
                        onClick={() => makeDefault(mailbox.id)}
                        className="rounded-full px-3 py-1 text-xs font-medium text-muted hover:text-fg"
                      >
                        Make default
                      </button>
                    )}
                    {confirmRemove === mailbox.id ? (
                      <>
                        <button
                          onClick={() => remove(mailbox.id)}
                          className="rounded-full bg-danger px-3 py-1 text-xs font-semibold text-white"
                        >
                          Remove
                        </button>
                        <button
                          onClick={() => setConfirmRemove(null)}
                          className="rounded-full px-2 py-1 text-xs text-muted"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmRemove(mailbox.id)}
                        className="rounded-full px-3 py-1 text-xs font-medium text-danger"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function GuideFrame({
  title,
  children,
  onContinue,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onContinue: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <button onClick={onClose} className="text-xs font-medium text-muted hover:text-fg">
          Close
        </button>
      </div>
      {children}
      <div className="flex justify-end">
        <button
          onClick={onContinue}
          className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function GmailGuide({ onContinue, onClose }: { onContinue: () => void; onClose: () => void }) {
  return (
    <GuideFrame title="Connect Gmail" onContinue={onContinue} onClose={onClose}>
      <p className="text-sm text-muted">Do this in Google first. The password form is the next step.</p>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm">
        <li>Turn on 2-Step Verification at myaccount.google.com/security.</li>
        <li>Create an App Password named LeadScout and copy the 16-character password. Your normal Gmail password will not work.</li>
        <li>In Gmail, open Settings, then See all settings, then Forwarding and POP/IMAP, and turn IMAP on.</li>
      </ol>
      <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-3 text-sm">
        <p className="font-medium">A personal Gmail is a limited sender</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted">
          <li>Mail sends as that @gmail.com address, and replies land in that Gmail inbox.</li>
          <li>A free Gmail account allows about 500 recipients a day. Google can throttle or lock the account if the mail looks like bulk cold email.</li>
          <li>Use it for light one-to-one mail while you are getting started. A domain address is the safer sender once outreach picks up.</li>
          <li>Each Gmail needs its own app password. LeadScout stores it encrypted and never shows it again.</li>
        </ul>
      </div>
    </GuideFrame>
  );
}

function BusinessGuide({ onContinue, onClose }: { onContinue: () => void; onClose: () => void }) {
  return (
    <GuideFrame title="Connect a business email" onContinue={onContinue} onClose={onClose}>
      <p className="text-sm text-muted">Do this at your email host first. Zoho hosts are filled in on the next step, and you can change them.</p>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm">
        <li>Create an app password for LeadScout in that mailbox. Use the app password when the host offers one.</li>
        <li>Copy the SMTP and IMAP host names and ports. Zoho is smtp.zoho.com port 587 and imap.zoho.com port 993. Zoho EU and other hosts can be typed over those values.</li>
        <li>On the domain DNS, add the SPF, DKIM, and DMARC records the host provides. LeadScout cannot set those.</li>
      </ol>
      <div className="rounded-lg border border-line bg-oat px-3 py-3 text-sm">
        <p className="font-medium">So the mail is less likely to land in spam</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted">
          <li>Send from an address on a domain you control, with a real from name.</li>
          <li>A new mailbox should start with a small number of personal emails before it is used for outreach.</li>
          <li>Write to one person at a time. The same message sent to many people at once is what lands in spam.</li>
          <li>Those DNS records tell other mail servers the domain is allowed to send.</li>
        </ul>
      </div>
    </GuideFrame>
  );
}
