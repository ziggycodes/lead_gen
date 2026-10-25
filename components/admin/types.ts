export type { AdminAccount } from "@/lib/accounts";
export type { AdminActionEntry } from "@/lib/adminAudit";
export type {
  AccountDetail,
  AdminSearchRow,
  AdminSearchStatus,
  AttentionItem,
  DailyPoint,
  Metric,
  OverviewStats,
  StatsRange,
} from "@/lib/adminStats";

export type AdminView = "overview" | "users" | "searches" | "activity" | "allowlist";
export type UserFocus = "all" | "premium" | "flagged" | "restricted" | "at_cap";

export const inputClass =
  "min-w-0 rounded-full border border-line bg-panel px-4 py-2 text-sm text-fg outline-none focus:border-accent";
export const buttonClass =
  "rounded-full border border-line bg-panel px-3 py-2 text-sm font-medium text-fg transition-opacity hover:border-ink disabled:opacity-40";
export const inkButtonClass =
  "rounded-full bg-ink px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40";
export const chipClass = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
    active ? "border-ink bg-ink text-white" : "border-line bg-panel text-fg hover:border-ink"
  }`;
