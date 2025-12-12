"use client";

import { useEffect, useState } from "react";
import {
  OverviewKpiCard,
  type OverviewKpi,
} from "./_components/overview-kpi-card";
import { NextAppointmentCard } from "./_components/next-appointment-card";
import { ProfessionalPayoutRow } from "./_components/professional-payout-row";
import {
  fetchOwnerOverview,
  type QuickFinancialCard,
} from "./_api/owner-overview";
import { useRequireAuth } from "@/lib/use-auth";
import { fetchOwnerAgendaDay, type OwnerAgendaDay } from "./_api/owner-agenda";
import { fetchOwnerFinanceiroWithRange } from "./_api/owner-financeiro";

type OwnerOverview = Awaited<ReturnType<typeof fetchOwnerOverview>>;
type OwnerFinanceiroData = Awaited<
  ReturnType<typeof fetchOwnerFinanceiroWithRange>
>;

type Slot = {
  timeLabel: string;
  appt: {
    serviceName: string;
    customerName: string;
  } | null;
};

const weekdayNames = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

// ----- helper para sobrescrever o KPI de receita prevista/faturada -----
function overrideRevenueKpiWithFinance(
  kpis: OverviewKpi[],
  financeiro: OwnerFinanceiroData,
  today: Date
): OverviewKpi[] {
  const todayKey = today.toISOString().slice(0, 10);

  // Serviços concluídos hoje (vem do dailyRevenue)
  const dailyItem = financeiro.dailyRevenue.find(
    (item) => item.date.slice(0, 10) === todayKey
  );
  const faturadoServicosHoje = dailyItem?.totalRevenue ?? 0;

  // Planos do dia (range já está só em "hoje")
  const totalPlanosDia = financeiro.planPayments.reduce(
    (sum, p) => sum + p.amount,
    0
  );
  const faturadoPlanosDia = financeiro.planPayments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);

  const faturadoHoje = faturadoServicosHoje + faturadoPlanosDia;
  const previstoHoje = faturadoServicosHoje + totalPlanosDia;

  return kpis.map((kpi) =>
    kpi.id === "expected_revenue_today"
      ? {
          ...kpi,
          value: `€ ${previstoHoje.toFixed(2)}`,
          helper:
            totalPlanosDia > 0
              ? `Faturado hoje: € ${faturadoHoje
                  .toFixed(2)
                  .replace(
                    ".",
                    ","
                  )} · Previsto (incl. planos do dia): € ${previstoHoje
                  .toFixed(2)
                  .replace(".", ",")}`
              : `Faturado hoje: € ${faturadoHoje.toFixed(2).replace(".", ",")}`,
        }
      : kpi
  );
}

export default function FluxoOwnerDashboard() {
  // garante que só user logado (e owner) veja esse painel
  const { user, loading: authLoading } = useRequireAuth({
    requiredRole: "owner",
  });

  const [data, setData] = useState<OwnerOverview | null>(null);
  const [agendaDay, setAgendaDay] = useState<OwnerAgendaDay | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOverview() {
      if (authLoading) return;
      if (!user) return;

      try {
        const today = new Date();
        const dayStart = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
          0,
          0,
          0,
          0
        );
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

        const [overviewResult, agendaResult, financeiro] = await Promise.all([
          fetchOwnerOverview(),
          fetchOwnerAgendaDay(dayStart.toISOString().slice(0, 10)),
          fetchOwnerFinanceiroWithRange({
            from: dayStart.toISOString(),
            to: dayEnd.toISOString(),
          }),
        ]);

        const updatedKpis = overrideRevenueKpiWithFinance(
          overviewResult.overviewKpis,
          financeiro,
          today
        );

        setData({
          ...overviewResult,
          overviewKpis: updatedKpis,
        });
        setAgendaDay(agendaResult);
      } catch (err) {
        console.error("Erro ao carregar overview do owner:", err);
        setError("Erro ao carregar os dados do painel.");
      } finally {
        setLoadingOverview(false);
      }
    }

    loadOverview();
  }, [authLoading, user]);

  // estados de carregamento / erro
  if (authLoading || loadingOverview || !data) {
    return (
      <div className="text-sm text-slate-400">
        Carregando painel do proprietário...
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-rose-400">{error}</div>;
  }

  const {
    overviewKpis,
    nextAppointments,
    quickFinancialCards,
    professionalPayouts,
  } = data;

  // Dia da semana atual
  const today = new Date();
  const weekdayLabelRaw = weekdayNames[today.getDay()] ?? "";
  const weekdayLabel =
    weekdayLabelRaw.charAt(0).toUpperCase() + weekdayLabelRaw.slice(1);

  // Monta os slots de agenda (08:00–13:30, de 30 em 30)
  const slots: Slot[] = Array.from({ length: 12 }).map((_, i) => {
    const hour = 8 + Math.floor(i / 2);
    const minute = i % 2 === 0 ? 0 : 30;

    const timeLabel = `${String(hour).padStart(2, "0")}:${
      minute === 0 ? "00" : "30"
    }`;

    const appt =
      agendaDay?.appointments.find((a) => a.time === timeLabel) ?? null;

    return appt
      ? {
          timeLabel,
          appt: {
            serviceName: appt.serviceName,
            customerName: appt.customerName,
          },
        }
      : { timeLabel, appt: null };
  });

  return (
    <>
      {/* Metric cards */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {overviewKpis.map((kpi) => (
          <OverviewKpiCard key={kpi.id} kpi={kpi} />
        ))}
      </section>

      {/* Agenda + Lista lateral */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar real (slots do dia) */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-slate-400">Agenda da unidade</p>
              <p className="text-sm font-medium">Hoje · {weekdayLabel}</p>
            </div>
            <div className="flex gap-2 text-xs">
              <button className="px-2 py-1 rounded-lg border border-slate-700 hover:border-emerald-500">
                Diário
              </button>
              <button className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-950/70 text-slate-400">
                Semanal
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 md:grid-cols-6 gap-2 text-xs">
            {slots.map((slot) => (
              <div
                key={slot.timeLabel}
                className="h-16 rounded-xl border border-slate-800/60 bg-slate-950/40 flex flex-col justify-between p-2"
              >
                <span className="text-[10px] text-slate-500">
                  {slot.timeLabel}
                </span>

                {slot.appt && (
                  <div className="text-[11px] bg-emerald-500/10 border border-emerald-500/40 text-emerald-200 rounded-lg px-1 py-[2px]">
                    {slot.appt.serviceName} · {slot.appt.customerName}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Próximos horários (ainda usando a lista vinda do overview) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">Próximos horários</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ver agenda completa
            </button>
          </div>
          <div className="space-y-2 text-xs">
            {nextAppointments.map((appt) => (
              <NextAppointmentCard key={appt.id} appointment={appt} />
            ))}
          </div>
        </div>
      </section>

      {/* Financeiro rápido */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-400">Resumo financeiro rápido</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Abrir financeiro
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {quickFinancialCards.map((card) => (
              <QuickFinancialCardBox key={card.id} card={card} />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-400">
              Próximos pagamentos a profissionais
            </p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ver todos
            </button>
          </div>
          <div className="space-y-2 text-xs">
            {professionalPayouts.map((payout) => (
              <ProfessionalPayoutRow key={payout.id} payout={payout} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function QuickFinancialCardBox({ card }: { card: QuickFinancialCard }) {
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
