import type { ReactNode } from "react";

export type OverviewKpi = {
  id: string;
  title: string;
  value: string;
  helper?: ReactNode;
  tone?: "positive" | "neutral";
};

export function OverviewKpiCard({ kpi }: { kpi: OverviewKpi }) {
  const isPositive = kpi.tone === "positive";

  const helperClass = isPositive ? "text-emerald-400" : "text-slate-400";
  const valueClass =
    kpi.id === "my_earnings_today" ? "text-emerald-400" : "text-slate-100";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs text-slate-400">{kpi.title}</p>

      <p className={`mt-2 text-2xl font-semibold ${valueClass}`}>{kpi.value}</p>

      {kpi.helper ? (
        <p className={`mt-1 text-[11px] ${helperClass}`}>{kpi.helper}</p>
      ) : null}
    </div>
  );
}
