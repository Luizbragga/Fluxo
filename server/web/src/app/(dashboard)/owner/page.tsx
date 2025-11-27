"use client";

import { useEffect, useState } from "react";
import { OverviewKpiCard } from "./_components/overview-kpi-card";
import { NextAppointmentCard } from "./_components/next-appointment-card";
import { ProfessionalPayoutRow } from "./_components/professional-payout-row";
import {
  fetchOwnerOverview,
  type QuickFinancialCard,
} from "./_api/owner-overview";
import { useRequireAuth } from "@/lib/use-auth";

type OwnerOverview = Awaited<ReturnType<typeof fetchOwnerOverview>>;

export default function FluxoOwnerDashboard() {
  // garante que só user logado (e owner) veja esse painel
  const { user, loading: authLoading } = useRequireAuth({
    requiredRole: "owner",
  });

  const [data, setData] = useState<OwnerOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOverview() {
      // enquanto ainda está verificando auth, não faz nada
      if (authLoading) return;

      // se não tiver user, o hook já vai redirecionar pra /login
      if (!user) return;

      try {
        const result = await fetchOwnerOverview();
        setData(result);
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
        {/* Calendar mock */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-slate-400">Agenda da unidade</p>
              <p className="text-sm font-medium">Hoje · Terça-feira</p>
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
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="h-16 rounded-xl border border-slate-800/60 bg-slate-950/40 flex flex-col justify-between p-2"
              >
                <span className="text-[10px] text-slate-500">
                  {8 + Math.floor(i / 2)}:{i % 2 === 0 ? "00" : "30"}
                </span>
                {i === 3 && (
                  <div className="text-[11px] bg-emerald-500/10 border border-emerald-500/40 text-emerald-200 rounded-lg px-1 py-[2px]">
                    Corte · João
                  </div>
                )}
                {i === 7 && (
                  <div className="text-[11px] bg-sky-500/10 border border-sky-500/40 text-sky-200 rounded-lg px-1 py-[2px]">
                    Plano · Henrique
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Próximos horários */}
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
