"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

export function YoyTrendChart({
  title,
  data,
  currentKey,
  previousKey,
  currentLabel,
  previousLabel,
  color = "#a9822f",
}: {
  title: string;
  data: Record<string, string | number>[];
  currentKey: string;
  previousKey: string;
  currentLabel: string;
  previousLabel: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium text-foreground-muted">{title}</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" fontSize={11} stroke="var(--foreground-muted)" />
          <YAxis fontSize={11} stroke="var(--foreground-muted)" width={40} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey={currentKey}
            name={currentLabel}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey={previousKey}
            name={previousLabel}
            stroke="#9ca3af"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
