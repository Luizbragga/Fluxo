// src/app/(dashboard)/owner/_components/overview-kpi-card.tsx

export type OverviewKpi = {
  id: string;
  title: string;
  value: string;
  helper: string;
  tone?: "positive" | "neutral";
};

export function OverviewKpiCard({ kpi }: { kpi: OverviewKpi }) {
  const helperClass =
    kpi.tone === "positive" ? "text-emerald-400" : "text-slate-400";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs text-slate-400">{kpi.title}</p>
      <p className="mt-2 text-2xl font-semibold">{kpi.value}</p>
      <p className={`mt-1 text-[11px] ${helperClass}`}>{kpi.helper}</p>
    </div>
  );
}
