// src/app/(dashboard)/owner/financeiro/page.tsx

type FinancialSummary = {
  id: string;
  label: string;
  value: string;
  helper?: string;
};

type ProfessionalEarning = {
  id: string;
  professionalName: string;
  totalAppointments: number;
  totalRevenue: number;
  professionalShare: number;
  spaceShare: number;
};

type PayoutItem = {
  id: string;
  professionalName: string;
  periodLabel: string;
  amount: number;
  status: "pending" | "paid";
};

type PlanPaymentItem = {
  id: string;
  customerName: string;
  planName: string;
  amount: number;
  paidAt?: string;
  dueAt: string;
  status: "pending" | "paid" | "late";
};

const financialSummary: FinancialSummary[] = [
  {
    id: "total_revenue",
    label: "Faturamento total (mês)",
    value: "€ 2.740",
    helper: "Serviços avulsos + planos",
  },
  {
    id: "space_share",
    label: "Parte do espaço",
    value: "€ 1.588",
    helper: "Após comissões de profissionais",
  },
  {
    id: "barber_share",
    label: "Parte dos profissionais",
    value: "€ 1.152",
    helper: "Somatório de comissões",
  },
  {
    id: "recurring_revenue",
    label: "Receita recorrente (planos)",
    value: "€ 1.395",
    helper: "Com base nos planos ativos",
  },
];

const professionalEarnings: ProfessionalEarning[] = [
  {
    id: "rafa",
    professionalName: "Rafa Barber",
    totalAppointments: 86,
    totalRevenue: 2150,
    professionalShare: 1290,
    spaceShare: 860,
  },
  {
    id: "joao",
    professionalName: "João Fade",
    totalAppointments: 63,
    totalRevenue: 1590,
    professionalShare: 954,
    spaceShare: 636,
  },
  {
    id: "ana",
    professionalName: "Ana Nails",
    totalAppointments: 41,
    totalRevenue: 980,
    professionalShare: 588,
    spaceShare: 392,
  },
];

const payoutItems: PayoutItem[] = [
  {
    id: "payout_1",
    professionalName: "Rafa Barber",
    periodLabel: "Período 18–24 Nov · 12 atendimentos",
    amount: 210,
    status: "pending",
  },
  {
    id: "payout_2",
    professionalName: "João Fade",
    periodLabel: "Período 11–17 Nov · pago",
    amount: 180,
    status: "paid",
  },
];

const planPayments: PlanPaymentItem[] = [
  {
    id: "pp_1",
    customerName: "Miguel Silva",
    planName: "Plano Corte Mensal",
    amount: 45,
    paidAt: "02 Nov 2025",
    dueAt: "02 Nov 2025",
    status: "paid",
  },
  {
    id: "pp_2",
    customerName: "Bianca Costa",
    planName: "Plano Nails Premium",
    amount: 65,
    paidAt: undefined,
    dueAt: "27 Nov 2025",
    status: "pending",
  },
  {
    id: "pp_3",
    customerName: "Carlos Andrade",
    planName: "Plano Corte Mensal",
    amount: 45,
    paidAt: undefined,
    dueAt: "15 Nov 2025",
    status: "late",
  },
];

export default function OwnerFinanceiroPage() {
  return (
    <>
      {/* Cabeçalho */}
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Financeiro</h1>
          <p className="text-xs text-slate-400">
            Resumo de faturamento, comissões de profissionais e pagamentos de
            planos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <select className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200">
            <option>Unidade Demo Barber – Centro</option>
          </select>
          <select className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200">
            <option>Novembro 2025</option>
            <option>Outubro 2025</option>
            <option>Setembro 2025</option>
          </select>
          <div className="flex rounded-lg border border-slate-800 bg-slate-900/80 overflow-hidden">
            <button className="px-3 py-1 text-slate-50 bg-slate-800 text-[11px]">
              Mês
            </button>
            <button className="px-3 py-1 text-slate-400 text-[11px]">
              Semana
            </button>
          </div>
        </div>
      </header>

      {/* Bloco de resumo + "gráfico" simples */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs text-slate-400 mb-3">
            Resumo financeiro do período
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {financialSummary.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"
              >
                <p className="text-[11px] text-slate-400">{item.label}</p>
                <p className="mt-1 text-lg font-semibold">{item.value}</p>
                {item.helper && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {item.helper}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Faturamento por dia (mock)</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ver relatórios
            </button>
          </div>
          {/* Gráfico fake em barras */}
          <div className="h-32 flex items-end gap-1">
            {[40, 80, 60, 100, 75, 50, 90].map((value, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full max-w-[16px] rounded-t-lg bg-emerald-500/60"
                  style={{ height: `${value}%` }}
                />
                <span className="mt-1 text-[9px] text-slate-500">
                  D{idx + 1}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Depois este bloco passa a usar dados reais de faturamento diário.
          </p>
        </div>
      </section>

      {/* Ganhos por profissional + repasses + pagamentos de planos */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Ganhos por profissional */}
        <div className="xl:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Ganhos por profissionais</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Exportar
            </button>
          </div>

          <div className="space-y-2">
            {professionalEarnings.map((pro) => (
              <div
                key={pro.id}
                className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-medium">
                      {pro.professionalName}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {pro.totalAppointments} atendimentos no período
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400">Receita total</p>
                    <p className="text-sm font-semibold">
                      € {pro.totalRevenue}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px]">
                  <div>
                    <p className="text-slate-400">Parte do profissional</p>
                    <p className="font-semibold text-emerald-300">
                      € {pro.professionalShare}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-400">Parte do espaço</p>
                    <p className="font-semibold">€ {pro.spaceShare}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Repasses */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Repasses / payouts</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ver todos
            </button>
          </div>

          <div className="space-y-2">
            {payoutItems.map((payout) => (
              <div
                key={payout.id}
                className={[
                  "rounded-xl border px-3 py-2 flex items-center justify-between",
                  payout.status === "pending"
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-slate-800 bg-slate-950/60 opacity-75",
                ].join(" ")}
              >
                <div>
                  <p className="text-[11px] font-medium">
                    {payout.professionalName}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {payout.periodLabel}
                  </p>
                  <p className="text-sm font-semibold mt-1">
                    € {payout.amount}
                  </p>
                </div>
                <div className="text-right">
                  <PayoutStatusBadge status={payout.status} />
                  <button
                    className="mt-2 px-2 py-[2px] rounded text-[10px] border border-slate-700 text-slate-200 hover:border-emerald-500"
                    disabled={payout.status === "paid"}
                  >
                    Marcar como pago
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pagamentos de planos */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Pagamentos de planos</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ver todos
            </button>
          </div>

          <div className="space-y-2 max-h-72 overflow-auto pr-1">
            {planPayments.map((payment) => (
              <div
                key={payment.id}
                className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 flex items-center justify-between"
              >
                <div>
                  <p className="text-[11px] font-medium">
                    {payment.customerName}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {payment.planName}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Vencimento: {payment.dueAt}
                    {payment.paidAt && ` · Pago em ${payment.paidAt}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">€ {payment.amount}</p>
                  <PlanPaymentStatusBadge status={payment.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function PayoutStatusBadge({ status }: { status: PayoutItem["status"] }) {
  const base = "inline-block px-2 py-[1px] rounded-full text-[9px]";
  if (status === "pending") {
    return (
      <span className={`${base} bg-amber-500/20 text-amber-100`}>Pendente</span>
    );
  }
  return (
    <span className={`${base} bg-emerald-500/20 text-emerald-100`}>Pago</span>
  );
}

function PlanPaymentStatusBadge({
  status,
}: {
  status: PlanPaymentItem["status"];
}) {
  const base = "inline-block mt-1 px-2 py-[1px] rounded-full text-[9px]";
  switch (status) {
    case "paid":
      return (
        <span className={`${base} bg-emerald-500/20 text-emerald-100`}>
          Pago
        </span>
      );
    case "pending":
      return (
        <span className={`${base} bg-sky-500/20 text-sky-100`}>Pendente</span>
      );
    case "late":
      return (
        <span className={`${base} bg-rose-500/20 text-rose-100`}>
          Em atraso
        </span>
      );
    default:
      return null;
  }
}
