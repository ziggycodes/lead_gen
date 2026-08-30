"use client";

import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { PieChart as PieIcon, BarChart3 } from "lucide-react";
import { CHART_COLORS, type Lead } from "./types";

export function ResultsCharts({ leads }: { leads: Lead[] }) {
  const nicheData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of leads) {
      const key = l.niche || "Other";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts, ([name, value]) => ({ name, value })).sort(
      (a, b) => b.value - a.value
    );
  }, [leads]);

  const contactData = useMemo(
    () => [
      { name: "Phone", count: leads.filter((l) => l.phone).length },
      { name: "Website", count: leads.filter((l) => l.website).length },
      { name: "Email", count: leads.filter((l) => l.email).length },
    ],
    [leads]
  );

  if (leads.length === 0) return null;

  return (
    <div className="mb-5 grid gap-3 md:grid-cols-2">
      <div className="rounded-2xl bg-oat/50 p-4">
        <div className="mb-2 flex items-center gap-2">
          <PieIcon className="h-4 w-4 text-muted" />
          <h3 className="text-sm font-semibold text-fg">Leads by niche</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-40 w-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={nicheData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={38}
                  outerRadius={70}
                  paddingAngle={2}
                  stroke="none"
                >
                  {nicheData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--color-line)",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="scroll-thin max-h-40 flex-1 space-y-1 overflow-y-auto pr-1">
            {nicheData.map((d, i) => (
              <li key={d.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  <span className="truncate text-muted">{d.name}</span>
                </span>
                <span className="font-semibold text-fg">{d.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl bg-oat/50 p-4">
        <div className="mb-2 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted" />
          <h3 className="text-sm font-semibold text-fg">Contact info found</h3>
        </div>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={contactData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: "var(--color-muted)" }}
                axisLine={{ stroke: "var(--color-line)" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: "var(--color-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--color-panel-2)" }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--color-line)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {contactData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
