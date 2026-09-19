"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

export function BarBreakdownChart({
  title,
  data,
  color = "#a9822f",
}: {
  title: string;
  data: { label: string; count: number }[];
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium text-foreground-muted">{title}</p>
      {data.length === 0 ? (
        <p className="flex h-[220px] items-center justify-center text-sm text-foreground-muted">
          データがありません
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 32)}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" fontSize={11} stroke="var(--foreground-muted)" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              fontSize={11}
              stroke="var(--foreground-muted)"
              width={110}
            />
            <Tooltip formatter={(v) => [`${v}件`, ""]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
