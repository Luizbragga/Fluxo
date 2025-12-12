"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export type RevenueChartPoint = {
  label: string;
  value: number;
};

type RevenueLineChartProps = {
  data: RevenueChartPoint[];
};

export function RevenueLineChart({ data }: RevenueLineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-[11px] text-slate-500">
        Sem dados de faturamento no período selecionado.
      </div>
    );
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#020617",
              borderColor: "#1e293b",
              borderRadius: 8,
              fontSize: 11,
            }}
            labelStyle={{ color: "#e2e8f0" }}
            formatter={(value: any) => [
              `€ ${Number(value).toFixed(2)}`,
              "Faturamento",
            ]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
