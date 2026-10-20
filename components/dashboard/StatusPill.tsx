import { STATUS_LABELS, STATUS_STYLES, isLeadStatus } from "@/lib/crm";

export function StatusPill({ status }: { status: string }) {
  const known = isLeadStatus(status);
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        known ? STATUS_STYLES[status] : "bg-oat text-muted"
      }`}
    >
      {known ? STATUS_LABELS[status] : status}
    </span>
  );
}
