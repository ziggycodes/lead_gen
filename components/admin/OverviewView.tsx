"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Ban, Clock, Flag } from "lucide-react";
import { chipClass, type AttentionItem, type DailyPoint, type OverviewStats, type StatsRange } from "./types";
import { deltaPercent, formatCount, formatDuration, formatNgn } from "./format";

const BAR_COLOR = "#c9a227";
const GRID_COLOR = "#ddd4c0";
const AXIS_COLOR = "#6f6758";

interface Tile {
  label: string;
  value: string;
  current: number;
  previous: number;
  // Rising failures are bad news, so the delta reads the other way.
  higherIsWorse?: boolean;
  onClick?: () => void;
}

export function OverviewView({
  initialStats,
  onOpenUser,
  onOpenUsers,
  onOpenSearches,
}: {
  initialStats: OverviewStats;
  onOpenUser: (userId: number) => void;
  onOpenUsers: () => void;
  onOpenSearches: (status?: "failed" | "stuck") => void;
}) {
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeRange(range: StatsRange) {
    if (range === stats.range || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stats?range=${range}d`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not load stats.");
        return;
      }
      setStats(data.stats as OverviewStats);
    } catch {
      setError("Could not load stats. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const failRate = (s: { failed: number; total: number }) => (s.total ? (s.failed / s.total) * 100 : 0);
  const failCur = failRate({ failed: stats.failedSearches.current, total: stats.searches.current });
  const failPrev = failRate({ failed: stats.failedSearches.previous, total: stats.searches.previous });

  const tiles: Tile[] = [
    { label: "Signups", value: formatCount(stats.signups.current), ...stats.signups, onClick: onOpenUsers },
    { label: "Active users", value: formatCount(stats.activeUsers.current), ...stats.activeUsers, onClick: onOpenUsers },
    { label: "Searches", value: formatCount(stats.searches.current), ...stats.searches, onClick: () => onOpenSearches() },
    {
      label: "Failure rate",
      value: `${failCur.toFixed(1)}%`,
      current: failCur,
      previous: failPrev,
      higherIsWorse: true,
      onClick: () => onOpenSearches("failed"),
    },
    { label: "Leads found", value: formatCount(stats.leadsFound.current), ...stats.leadsFound },
    { label: "Revenue", value: formatNgn(stats.revenueNgn.current), ...stats.revenueNgn },
  ];

  return (
    <section className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-2 text-sm text-muted">
            Last {stats.range} days against the {stats.range} before. {formatCount(stats.totalUsers)} accounts in total.
          </p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Time range">
          {([7, 30] as StatsRange[]).map((range) => (
            <button
              key={range}
              type="button"
              disabled={loading}
              aria-pressed={stats.range === range}
              onClick={() => changeRange(range)}
              className={chipClass(stats.range === range)}
            >
              {range} days
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <ul className={`mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
        {tiles.map((tile) => (
          <li key={tile.label}>
            <KpiTile tile={tile} range={stats.range} />
          </li>
        ))}
      </ul>

      <p className="mt-4 text-sm text-muted">
        {formatCount(stats.emailsFoundToday)} contact emails found today
        {stats.medianSearchSeconds != null
          ? ` · Median search takes ${formatDuration(stats.medianSearchSeconds)}`
          : ""}
        {stats.payingUsers.current ? ` · ${formatCount(stats.payingUsers.current)} paying users` : ""}
      </p>

      <div className="mt-8 grid gap-3 lg:grid-cols-2">
        <DailyBars title="Signups per day" data={stats.daily} dataKey="signups" />
        <DailyBars title="Searches per day" data={stats.daily} dataKey="searches" />
      </div>

      <div className="mt-10">
        <h2 className="font-display text-xl font-semibold">Needs attention</h2>
        {stats.attention.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing needs you right now.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {stats.attention.map((item) => (
              <li key={`${item.kind}-${item.searchId ?? item.userId}`}>
                <AttentionRow item={item} onOpenUser={onOpenUser} onOpenSearches={onOpenSearches} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function KpiTile({ tile, range }: { tile: Tile; range: StatsRange }) {
  const delta = deltaPercent(tile.current, tile.previous);
  // With no prior baseline, any failures at all still count as bad news.
  const worse =
    delta == null
      ? Boolean(tile.higherIsWorse) && tile.current > 0
      : delta !== 0 && (tile.higherIsWorse ? delta > 0 : delta < 0);
  const deltaText =
    delta == null ? "New this period" : delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${delta}% vs prior ${range}d`;
  const body = (
    <>
      <span className="text-sm text-muted">{tile.label}</span>
      <span className="mt-1 block font-display text-2xl font-semibold tabular-nums">{tile.value}</span>
      <span className={`mt-1 block text-xs ${worse ? "text-danger" : "text-muted"}`}>{deltaText}</span>
    </>
  );
  const cls = "block h-full w-full rounded-2xl border border-line bg-panel p-4 text-left";
  return tile.onClick ? (
    <button type="button" onClick={tile.onClick} className={`${cls} transition-colors hover:border-ink`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function shortDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function DailyBars({ title, data, dataKey }: { title: string; data: DailyPoint[]; dataKey: "signups" | "searches" }) {
  const total = data.reduce((sum, point) => sum + point[dataKey], 0);
  return (
    <figure className="rounded-2xl border border-line bg-panel p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted tabular-nums">{formatCount(total)} total</span>
      </figcaption>
      <div className="mt-3 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={GRID_COLOR} strokeDasharray="0" />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              tick={{ fill: AXIS_COLOR, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(28,25,20,0.06)" }}
              labelFormatter={(day) => shortDay(String(day))}
              formatter={(value) => [formatCount(Number(value)), title.replace(" per day", "")]}
              contentStyle={{ borderRadius: 12, border: `1px solid ${GRID_COLOR}`, fontSize: 12 }}
            />
            <Bar dataKey={dataKey} fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full tabular-nums">
          <tbody>
            {data.map((point) => (
              <tr key={point.day}>
                <td className="py-0.5">{shortDay(point.day)}</td>
                <td className="py-0.5 text-right">{point[dataKey]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

const ATTENTION_META: Record<AttentionItem["kind"], { icon: typeof Flag; tag: string }> = {
  stuck_search: { icon: Clock, tag: "Stuck search" },
  failed_search: { icon: AlertTriangle, tag: "Failed search" },
  at_email_cap: { icon: Ban, tag: "At email cap" },
  flagged: { icon: Flag, tag: "Flagged" },
};

function AttentionRow({
  item,
  onOpenUser,
  onOpenSearches,
}: {
  item: AttentionItem;
  onOpenUser: (userId: number) => void;
  onOpenSearches: (status?: "failed" | "stuck") => void;
}) {
  const meta = ATTENTION_META[item.kind];
  const Icon = meta.icon;
  const onClick = () => {
    if (item.kind === "stuck_search") onOpenSearches("stuck");
    else if (item.kind === "failed_search") onOpenSearches("failed");
    else if (item.userId) onOpenUser(item.userId);
  };
  return (
    <button type="button" onClick={onClick} className="flex w-full items-start gap-3 py-3 text-left hover:bg-panel">
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${item.kind === "flagged" || item.kind === "at_email_cap" ? "text-muted" : "text-danger"}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {item.label} <span className="font-normal text-muted">· {meta.tag}</span>
        </span>
        <span className="block truncate text-sm text-muted">{item.detail}</span>
      </span>
    </button>
  );
}
