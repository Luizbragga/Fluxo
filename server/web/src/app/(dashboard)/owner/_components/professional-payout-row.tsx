// src/app/(dashboard)/owner/_components/professional-payout-row.tsx

export type ProfessionalPayoutStatus = "pending" | "paid";

export type ProfessionalPayout = {
  id: string;
  professionalName: string;
  periodLabel: string;
  amount: number;
  status: ProfessionalPayoutStatus;
};

type ProfessionalPayoutRowProps = {
  payout: ProfessionalPayout;
};

export function ProfessionalPayoutRow({ payout }: ProfessionalPayoutRowProps) {
  const statusLabel = payout.status === "pending" ? "pendente" : "pago";

  const statusClass =
    payout.status === "pending" ? "text-amber-400" : "text-emerald-400";

  const opacityClass = payout.status === "pending" ? "" : "opacity-60";

  return (
    <div
      className={`flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 ${opacityClass}`}
    >
      <div>
        <p className="font-medium">{payout.professionalName}</p>
        <p className="text-[11px] text-slate-400">{payout.periodLabel}</p>
      </div>
      <div className="text-right">
        <p className="font-semibold">€ {payout.amount}</p>
        <p className={`text-[11px] ${statusClass}`}>{statusLabel}</p>
      </div>
    </div>
  );
}
