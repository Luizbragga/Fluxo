"use client";

import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/use-auth";
import {
  fetchOwnerFinanceiro,
  fetchOwnerFinanceiroWithRange,
  type OwnerFinanceiroData,
  type PayoutItem,
  type PlanPaymentItem,
  type DailyRevenueItem,
} from "../_api/owner-financeiro";

type FinancePeriod = "month" | "week";

function getCurrentWeekRange() {
  const now = new Date();
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);

  const dayOfWeek = current.getDay(); // 0=dom, 1=seg, ...
  const diffToMonday = (dayOfWeek + 6) % 7; // seg=0, dom=6

  const monday = new Date(current);
  monday.setDate(current.getDate() - diffToMonday);

  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  return {
    from: monday.toISOString(),
    to: nextMonday.toISOString(),
  };
}

export default function OwnerFinanceiroPage() {
  const { user, loading: authLoading } = useRequireAuth({
    requiredRole: "owner",
  });

  const [data, setData] = useState<OwnerFinanceiroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [period, setPeriod] = useState<FinancePeriod>("month");

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    async function load() {
      try {
        setLoading(true);

        let result: OwnerFinanceiroData;

        if (period === "month") {
          // comportamento atual (mês)
          result = await fetchOwnerFinanceiro();
        } else {
          // semana = segunda → segunda
          const { from, to } = getCurrentWeekRange();
          result = await fetchOwnerFinanceiroWithRange({ from, to });
        }

        setData(result);
        setError(null);
      } catch (err) {
        console.error("Erro ao carregar financeiro do owner:", err);
        setError("Erro ao carregar dados financeiros.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [authLoading, user, period]);

  if (authLoading || loading || !data) {
    return (
      <div className="text-sm text-slate-400">
        Carregando dados financeiros...
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-rose-400">{error}</div>;
  }

  const {
    financialSummary,
    professionalEarnings,
    payoutItems,
    planPayments,
    dailyRevenue,
  } = data;

  // garante que nunca vamos dividir por 0
  const maxDailyRevenueRaw = dailyRevenue.reduce(
    (max, d) => (d.totalRevenue > max ? d.totalRevenue : max),
    0
  );
  const maxDailyRevenue = maxDailyRevenueRaw > 0 ? maxDailyRevenueRaw : 1;

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
            <option>Período atual</option>
          </select>
          <div className="flex rounded-lg border border-slate-800 bg-slate-900/80 overflow-hidden">
            <button
              type="button"
              onClick={() => setPeriod("month")}
              className={[
                "px-3 py-1 text-[11px]",
                period === "month"
                  ? "bg-slate-800 text-slate-50"
                  : "text-slate-400",
              ].join(" ")}
            >
              Mês
            </button>
            <button
              type="button"
              onClick={() => setPeriod("week")}
              className={[
                "px-3 py-1 text-[11px]",
                period === "week"
                  ? "bg-slate-800 text-slate-50"
                  : "text-slate-400",
              ].join(" ")}
            >
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
            <p className="text-slate-400">Faturamento por dia</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ver relatórios
            </button>
          </div>

          {dailyRevenue.length === 0 ? (
            <p className="mt-4 text-[11px] text-slate-500">
              Não há faturamento registrado neste período.
            </p>
          ) : (
            <>
              <div className="h-32 flex items-end gap-1">
                {dailyRevenue.map((item) => {
                  // evita NaN / Infinity e garante uma barra mínima
                  const ratio =
                    maxDailyRevenue > 0
                      ? item.totalRevenue / maxDailyRevenue
                      : 0;
                  const height = Math.max(Math.round(ratio * 100), 8); // pelo menos 8%

                  const dateLabel = new Date(item.date).getDate();

                  return (
                    <div
                      key={item.date}
                      className="flex-1 flex h-full flex-col items-center"
                    >
                      <div
                        className="w-full max-w-[16px] rounded-t-lg bg-emerald-500/60"
                        style={{ height: `${height}%` }}
                      />
                      <span className="mt-1 text-[9px] text-slate-500">
                        {dateLabel}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="mt-2 text-[10px] text-slate-500">
                Faturamento diário com base em atendimentos concluídos no
                período atual.
              </p>
            </>
          )}
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

        {/* Pagamentos de planos (por enquanto mockados no _api) */}
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
