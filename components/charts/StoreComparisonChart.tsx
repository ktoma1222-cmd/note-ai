"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

function formatByUnit(v: number, unit: "currency" | "percent") {
  return unit === "currency" ? `¥${Math.round(v / 10000)}万` : `${v.toFixed(0)}%`;
}

export function StoreComparisonChart({
  title,
  data,
  color = "#a9822f",
  unit = "currency",
}: {
  title: string;
  data: { storeName: string; value: number }[];
  color?: string;
  unit?: "currency" | "percent";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium text-foreground-muted">{title}</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="storeName" fontSize={12} stroke="var(--foreground-muted)" />
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
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
