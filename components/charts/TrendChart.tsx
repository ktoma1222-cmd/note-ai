"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

function formatByUnit(v: number, unit: "currency" | "percent") {
  return unit === "currency" ? `¥${Math.round(v / 10000)}万` : `${v.toFixed(0)}%`;
}

export function TrendChart({
  title,
  data,
  dataKey,
  color = "#a9822f",
  unit = "currency",
}: {
  title: string;
  data: { label: string; value: number | null }[];
  dataKey?: string;
  color?: string;
  unit?: "currency" | "percent";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium text-foreground-muted">{title}</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" fontSize={11} stroke="var(--foreground-muted)" />
          <YAxis
            fontSize={11}
            stroke="var(--foreground-muted)"
            width={56}
            tickFormatter={(v) => formatByUnit(v, unit)}
          />
          <Tooltip
            formatter={(v) => formatByUnit(Number(v), unit)}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={dataKey ?? title}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
