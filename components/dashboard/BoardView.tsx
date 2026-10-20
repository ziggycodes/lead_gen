"use client";

import { useState } from "react";
import { LEAD_STATUSES, STATUS_LABELS, type LeadStatus } from "@/lib/crm";
import type { CrmLead } from "./types";
import { isFollowUpDue, location } from "./format";
import { bulkUpdateLeads } from "./crmApi";

export function BoardView({
  leads,
  onOpenLead,
  onLeadsUpdated,
}: {
  leads: CrmLead[];
  onOpenLead: (id: number) => void;
  onLeadsUpdated: (leads: CrmLead[]) => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStatus | null>(null);

  const move = async (id: number, status: LeadStatus) => {
    const current = leads.find((l) => l.id === id);
    if (!current || current.status === status) return;
    setBusyId(id);
    setError(null);
    try {
      const { leads: updated } = await bulkUpdateLeads([id], { status });
      onLeadsUpdated(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && <p className="px-4 pt-3 text-sm text-danger">{error}</p>}
      <p className="px-4 pt-3 text-xs text-muted">Drag a lead into another stage.</p>
      <div className="scroll-thin flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 pt-2">
        {LEAD_STATUSES.map((status) => {
          const column = leads.filter((l) => l.status === status);
          return (
            <section
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = Number(e.dataTransfer.getData("text/plain"));
                if (Number.isInteger(id) && id > 0) move(id, status);
              }}
              className={`flex w-56 shrink-0 flex-col rounded-xl border ${
                over === status ? "border-accent bg-accent/10" : "border-line bg-oat/50"
              }`}
            >
              <header className="flex items-center justify-between px-3 py-2">
                <h3 className="text-sm font-semibold text-fg">{STATUS_LABELS[status]}</h3>
                <span className="text-xs tabular-nums text-muted">{column.length}</span>
              </header>
              <ul className="scroll-thin flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {column.map((l) => {
                  const due = isFollowUpDue(l.followUpAt);
                  return (
                    <li key={l.id}>
                      <button
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", String(l.id));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => onOpenLead(l.id)}
                        disabled={busyId === l.id}
                        className={`w-full cursor-grab rounded-lg border bg-panel px-3 py-2 text-left shadow-sm active:cursor-grabbing ${
                          due ? "border-accent" : "border-line"
                        } ${busyId === l.id ? "opacity-50" : "hover:border-ink/30"}`}
                      >
                        <span className="block truncate text-sm font-semibold text-fg">{l.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {location(l.city, l.state) || l.niche || "—"}
                        </span>
                        {due && <span className="mt-1 block text-[11px] font-semibold text-accent">Due</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
