"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchOwnerPlans,
  OwnerPlansData,
  PlanCustomer,
} from "../_api/owner-plans";

export default function OwnerPlanosPage() {
  const searchParams = useSearchParams();
  const locationId = searchParams.get("locationId") ?? undefined;

  const [data, setData] = useState<OwnerPlansData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchOwnerPlans({ locationId });
        if (!cancelled) {
          setData(result);
          setSelectedId((prev) =>
            prev && result.planTemplates.some((p) => p.id === prev)
              ? prev
              : result.planTemplates[0]?.id ?? null
          );
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Erro ao carregar planos.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  if (loading) {
    return (
      <div className="p-4 text-xs text-slate-400">
        Carregando planos de assinatura...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-xs text-rose-300">
        Erro ao carregar planos: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-xs text-slate-400">
        Nenhum dado de planos disponível.
      </div>
    );
  }

  const { planTemplates, planStats, planCustomersByPlan } = data;

  const selectedPlan = selectedId
    ? planTemplates.find((p) => p.id === selectedId) ?? null
    : null;

  const selectedStats = selectedId
    ? planStats.find((s) => s.planId === selectedId)
    : undefined;

  const customers: PlanCustomer[] = selectedId
    ? planCustomersByPlan[selectedId] ?? []
    : [];

  return (
    <>
      {/* Cabeçalho */}
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Planos</h1>
          <p className="text-xs text-slate-400">
            Gestão de planos de assinatura, clientes recorrentes e receitas.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80">
            Todos
          </button>
          <button className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80">
            Ativos
          </button>
          <button className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80">
            Inativos
          </button>
          <button className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200">
            + Criar plano
          </button>
        </div>
      </header>

      {/* Grid principal: lista de planos + detalhe */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lista de planos */}
        <div className="lg:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Catálogo de planos</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ver pagamentos
            </button>
          </div>

          <div className="mb-3">
            <input
              placeholder="Buscar por nome de plano..."
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-2">
            {planTemplates.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                Ainda não há templates de planos cadastrados.
              </p>
            ) : (
              planTemplates.map((plan) => {
                const isSelected = plan.id === selectedId;
                const stats = planStats.find((s) => s.planId === plan.id);

                return (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedId(plan.id)}
                    className={[
                      "w-full text-left rounded-xl border px-3 py-2 transition-colors",
                      isSelected
                        ? "border-emerald-500/60 bg-emerald-500/5"
                        : "border-slate-800 bg-slate-950/60 hover:border-slate-700",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-[13px]">{plan.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {plan.periodLabel} · {plan.visitsIncluded} visitas
                        </p>
                        <p className="text-[10px] text-slate-500">
                          € {plan.price} / mês
                        </p>
                      </div>
                      <div className="text-right">
                        {stats && (
                          <>
                            <p className="text-[11px] text-slate-400">Ativos</p>
                            <p className="text-sm font-semibold">
                              {stats.activeCustomers}
                            </p>
                          </>
                        )}
                        <span
                          className={[
                            "inline-flex mt-1 rounded-full px-2 py-[1px] text-[9px]",
                            plan.isActive
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-slate-700 text-slate-200",
                          ].join(" ")}
                        >
                          {plan.isActive ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detalhe do plano selecionado */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
            {selectedPlan ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[11px] text-slate-400">
                      Plano selecionado
                    </p>
                    <p className="text-sm font-semibold">{selectedPlan.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {selectedPlan.periodLabel} · {selectedPlan.visitsIncluded}{" "}
                      visitas incluídas
                    </p>
                    <p className="mt-2 text-[11px] text-slate-300">
                      {selectedPlan.description}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-400">Preço base</p>
                    <p className="text-lg font-semibold">
                      € {selectedPlan.price}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {selectedPlan.currency} · faturado{" "}
                      {selectedPlan.periodLabel.toLowerCase()}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Estado do plano
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {selectedPlan.isActive ? "Ativo" : "Inativo"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Depois vamos permitir ativar/desativar aqui de forma
                      segura.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Integração backend
                    </p>
                    <p className="mt-1 text-sm font-semibold">PlanTemplate</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Estes dados vêm diretamente da tabela de templates de
                      plano.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Cobranças &amp; pagamentos
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      CustomerPlanPayment
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Aqui vamos ligar o status (pending, paid, late) por
                      cliente.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">
                Ainda não há nenhum plano cadastrado.
              </p>
            )}
          </div>

          {/* Estatísticas e clientes do plano */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400">Resumo numérico</p>
                <button className="text-[11px] text-emerald-400 hover:underline">
                  Ver relatório
                </button>
              </div>

              {selectedStats ? (
                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Clientes ativos
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {selectedStats.activeCustomers}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Receita recorrente (mês)
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      € {selectedStats.totalRevenueMonth}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Churn aproximado
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {selectedStats.churnRatePercent}%
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Ainda não há dados suficientes para este plano.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400">Clientes neste plano</p>
                <button className="text-[11px] text-emerald-400 hover:underline">
                  Ver todos os pagamentos
                </button>
              </div>

              {customers.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  Ainda não há clientes neste plano.
                </p>
              ) : (
                <div className="space-y-2">
                  {customers.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-[11px] font-medium">{c.name}</p>
                        <p className="text-[11px] text-slate-400">{c.phone}</p>
                        <p className="text-[10px] text-slate-500">
                          Desde {c.startedAt}
                        </p>
                      </div>
                      <div className="text-right">
                        {c.nextChargeDate && c.nextChargeAmount && (
                          <p className="text-[10px] text-slate-400">
                            Próx. cobrança: {c.nextChargeDate}
                          </p>
                        )}
                        <PlanCustomerStatusBadge status={c.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function PlanCustomerStatusBadge({
  status,
}: {
  status: PlanCustomer["status"];
}) {
  const base = "inline-block mt-1 px-2 py-[1px] rounded-full text-[9px]";
  switch (status) {
    case "active":
      return (
        <span className={`${base} bg-emerald-500/20 text-emerald-100`}>
          Ativo
        </span>
      );
    case "late":
      return (
        <span className={`${base} bg-amber-500/20 text-amber-100`}>
          Em atraso
        </span>
      );
    case "cancelled":
      return (
        <span className={`${base} bg-rose-500/20 text-rose-100`}>
          Cancelado
        </span>
      );
    default:
      return (
        <span className={`${base} bg-slate-600/40 text-slate-100`}>
          {status}
        </span>
      );
  }
}
