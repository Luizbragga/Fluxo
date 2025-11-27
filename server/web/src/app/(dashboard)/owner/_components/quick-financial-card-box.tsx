// src/app/(dashboard)/owner/_components/quick-financial-card-box.tsx

export type QuickFinancialCard = {
  id: string;
  title: string;
  value: string;
  helper: string;
  accent?: "positive" | "neutral";
};

export function QuickFinancialCardBox({ card }: { card: QuickFinancialCard }) {
  const helperClass =
    card.accent === "positive" ? "text-emerald-400" : "text-slate-400";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <p className="text-slate-400 text-[11px]">{card.title}</p>
      <p className="mt-1 text-lg font-semibold">{card.value}</p>
      <p className={`mt-1 text-[11px] ${helperClass}`}>{card.helper}</p>
    </div>
  );
}
