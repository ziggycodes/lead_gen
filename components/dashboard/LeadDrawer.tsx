"use client";

import { useEffect, useState } from "react";
import {
  X,
  Star,
  Phone,
  Globe,
  Mail,
  MapPin,
  Lightbulb,
  Target,
  Radio,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import type { Lead } from "./types";

function leadToText(l: Lead): string {
  return [
    l.name,
    l.niche && `Niche: ${l.niche}`,
    (l.city || l.state) && `Location: ${[l.city, l.state].filter(Boolean).join(", ")}`,
    l.phone && `Phone: ${l.phone}`,
    l.website && `Website: ${l.website}`,
    l.email && `Email: ${l.email}`,
    l.address && `Address: ${l.address}`,
    l.painPoint && `Pain point: ${l.painPoint}`,
    l.pitchAngle && `Pitch angle: ${l.pitchAngle}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function LeadDrawer({
  lead,
  isSaved,
  onToggleSave,
  onClose,
}: {
  lead: Lead | null;
  isSaved: boolean;
  onToggleSave: (lead: Lead) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [lead]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (lead) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lead, onClose]);

  if (!lead) return null;

  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(leadToText(lead));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-ink/20 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-line bg-panel shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line bg-oat px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-semibold tracking-tight">{lead.name}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-full bg-accent/25 px-2 py-0.5 font-medium text-ink">
                {lead.niche}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {[lead.city, lead.state].filter(Boolean).join(", ") || "-"}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-panel-2 hover:text-fg"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 border-b border-line px-5 py-3">
          <button
            onClick={() => onToggleSave(lead)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition ${
              isSaved
                ? "bg-ink text-white shadow-sm hover:opacity-90"
                : "border border-line text-fg hover:border-accent hover:text-accent"
            }`}
          >
            <Star className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
            {isSaved ? "Saved" : "Save lead"}
          </button>
          <button
            onClick={copyDetails}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line px-3 py-2 text-sm font-semibold text-fg transition hover:border-mint hover:text-mint"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy details"}
          </button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
          <dl className="space-y-3">
            <DetailRow icon={<Phone className="h-4 w-4" />} label="Phone">
              {lead.phone || <span className="text-muted">Not available</span>}
            </DetailRow>
            <DetailRow icon={<Globe className="h-4 w-4" />} label="Website">
              {lead.website ? (
                <a
                  href={lead.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  {lead.website.replace(/^https?:\/\//, "")}
                </a>
              ) : (
                <span className="text-muted">Not available</span>
              )}
            </DetailRow>
            <DetailRow icon={<Mail className="h-4 w-4" />} label="Email">
              {lead.email || <span className="text-muted">Not available</span>}
            </DetailRow>
            <DetailRow icon={<MapPin className="h-4 w-4" />} label="Address">
              {lead.address || <span className="text-muted">Not available</span>}
            </DetailRow>
            <DetailRow icon={<Lightbulb className="h-4 w-4" />} label="Likely pain point">
              {lead.painPoint || <span className="text-muted">-</span>}
            </DetailRow>
            <DetailRow icon={<Target className="h-4 w-4" />} label="Pitch angle">
              <span className="text-mint">{lead.pitchAngle || "-"}</span>
            </DetailRow>
            {lead.signals && (
              <DetailRow icon={<Radio className="h-4 w-4" />} label="Signals">
                {lead.signals}
              </DetailRow>
            )}
          </dl>

          {lead.osmLink && (
            <a
              href={lead.osmLink}
              target="_blank"
              rel="noreferrer"
              className="mt-5 flex items-center justify-center gap-1.5 rounded-full border border-line px-3 py-2.5 text-sm font-medium text-fg transition hover:border-accent hover:text-accent"
            >
              <ExternalLink className="h-4 w-4" />
              View on OpenStreetMap
            </a>
          )}
        </div>
      </aside>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-oat text-muted">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium text-muted">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-fg">{children}</dd>
      </div>
    </div>
  );
}
