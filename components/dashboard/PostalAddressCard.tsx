"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { fetchPostalAddress, savePostalAddress } from "./crmApi";

// Every account's own physical address, printed at the foot of its bulk emails.
export function PostalAddressCard() {
  const [address, setAddress] = useState("");
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchPostalAddress()
      .then((json) => {
        setSaved(json.postalAddress);
        setAddress(json.postalAddress ?? "");
      })
      .catch((err) => setMessage({ ok: false, text: (err as Error).message }));
  }, []);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { postalAddress } = await savePostalAddress(address);
      setSaved(postalAddress);
      setAddress(postalAddress);
      setMessage({ ok: true, text: "Saved. New bulk emails will show this address." });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="max-w-xl space-y-3">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <MapPin className="h-4 w-4" /> Your mailing address
          {saved === null && <span className="font-medium text-danger">· Required for bulk email</span>}
        </h2>
        <p className="mt-1 text-xs text-muted">
          US law (CAN-SPAM) requires a physical address in commercial email, so this appears at the bottom of every bulk
          email you send. Everyone you email can see it.
        </p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-muted">
          <li>Use a real address where you can receive mail: an office, your home, a PO box, or a private mailbox.</li>
          <li>Working from home? A PO box or virtual mailbox keeps your home address private.</li>
          <li>An email address or website doesn&apos;t count, even one on your own domain.</li>
        </ul>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-3 rounded-xl border border-line bg-panel px-4 py-4"
      >
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted">Business name and address</span>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            maxLength={320}
            placeholder="Acme Marketing, 12 Example Street, Austin, TX 78701"
            className="mt-1 w-full resize-y rounded-lg border border-line bg-oat px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:bg-panel"
          />
        </label>
        <div className="flex items-center justify-end gap-3">
          {message && <span className={`text-xs ${message.ok ? "text-muted" : "text-danger"}`}>{message.text}</span>}
          <button
            type="submit"
            disabled={busy || saved === undefined}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save address"}
          </button>
        </div>
      </form>
    </section>
  );
}
