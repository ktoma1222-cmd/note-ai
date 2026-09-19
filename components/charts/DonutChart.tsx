"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const COLORS = ["#a9822f", "#1f7a4d", "#6b6862", "#b3412c", "#7c6fb0", "#3d7ea6", "#c98a3f"];

export function DonutChart({
  title,
  data,
}: {
  title: string;
  data: { label: string; count: number }[];
}) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium text-foreground-muted">{title}</p>
      {total === 0 ? (
        <p className="flex h-[220px] items-center justify-center text-sm text-foreground-muted">
          データがありません
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
            >
              {data.map((entry, i) => (
                <Cell key={entry.label} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [`${value}件 (${((Number(value) / total) * 100).toFixed(1)}%)`, name]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              wrapperStyle={{ fontSize: 11 }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
