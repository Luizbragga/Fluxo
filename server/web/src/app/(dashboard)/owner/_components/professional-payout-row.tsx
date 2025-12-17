// web/src/app/(dashboard)/owner/_components/professional-payout-row.tsx
"use client";

import Link from "next/link";

export type ProfessionalPayoutStatus = "pending" | "paid";

export type ProfessionalPayout = {
  id: string; // (no seu caso, está servindo como providerId no overview)
  professionalName: string;
  periodLabel: string;
  amount: number;
  status: ProfessionalPayoutStatus;
};

type ProfessionalPayoutRowProps = {
  payout: ProfessionalPayout;

  // ✅ se vier, vira link; se não, fica "normal"
  href?: string;
};

export function ProfessionalPayoutRow({
  payout,
  href,
}: ProfessionalPayoutRowProps) {
  const statusLabel = payout.status === "pending" ? "pendente" : "pago";
  const statusClass =
    payout.status === "pending" ? "text-amber-400" : "text-emerald-400";
  const opacityClass = payout.status === "pending" ? "" : "opacity-60";

  const content = (
    <div
      className={[
        "flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2",
        opacityClass,
        href
          ? "hover:border-emerald-500/60 transition-colors cursor-pointer"
          : "",
      ].join(" ")}
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

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}
