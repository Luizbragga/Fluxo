// src/app/(dashboard)/owner/relatorios/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchOwnerMonthlyFinancial,
  type MonthlyFinancialRow,
  type ReportsRangePreset,
  fetchOwnerCancellations,
  type CancellationItem,
  fetchOwnerProviderEarningsDetailed,
  type ProviderEarningRow,
} from "../_api/owner-reports";

import {
  fetchOwnerFinanceiroWithRange,
  type DailyRevenueItem,
} from "../_api/owner-financeiro";
import {
  RevenueLineChart,
  type RevenueChartPoint,
} from "../_components/revenue-line-chart";

// ----------------- Helpers -----------------

function getRangeFromPreset(preset: ReportsRangePreset): {
  from?: string;
  to?: string;
} {
  const now = new Date();

  const to = new Date(now);
  const from = new Date(now);

  if (preset === "last_30_days") {
    from.setDate(from.getDate() - 30);
  } else if (preset === "last_90_days") {
    from.setDate(from.getDate() - 90);
  } else {
    // last_12_months
    from.setFullYear(from.getFullYear() - 1);
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function formatDateLabelForPreset(
  dateStr: string,
  preset: ReportsRangePreset
): string {
  const d = new Date(dateStr);

  if (preset === "last_12_months") {
    return d.toLocaleDateString("pt-PT", {
      month: "short",
      year: "2-digit",
    });
  }

  return d.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
  });
}

// ----------------- Componente principal -----------------

export default function OwnerRelatoriosPage() {
  const [rangePreset, setRangePreset] =
    useState<ReportsRangePreset>("last_30_days");

  const [monthlyFinancialRows, setMonthlyFinancialRows] = useState<
    MonthlyFinancialRow[]
  >([]);
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenueItem[]>([]);

  const [loadingFinancial, setLoadingFinancial] = useState(true);
  const [errorFinancial, setErrorFinancial] = useState<string | null>(null);
  // relatório por profissional (dados reais)
  const [providersReport, setProvidersReport] = useState<ProviderEarningRow[]>(
    []
  );
  const [providersTotals, setProvidersTotals] = useState<{
    totalRevenue: number;
    totalProviderEarnings: number;
    totalHouseEarnings: number;
  } | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [errorProviders, setErrorProviders] = useState<string | null>(null);

  const [cancellationsFilter, setCancellationsFilter] = useState<
    "all" | "cancelled" | "no_show"
  >("all");
  const [cancellations, setCancellations] = useState<CancellationItem[]>([]);
  const [loadingCancellations, setLoadingCancellations] = useState(true);
  const [errorCancellations, setErrorCancellations] = useState<string | null>(
    null
  );

  // Carrega finanças (mensal + diário) com base no preset
  useEffect(() => {
    async function loadFinancial() {
      try {
        setLoadingFinancial(true);
        setErrorFinancial(null);

        const range = getRangeFromPreset(rangePreset);

        const [monthlyRows, financeiroData] = await Promise.all([
          fetchOwnerMonthlyFinancial(rangePreset),
          fetchOwnerFinanceiroWithRange(range),
        ]);

        setMonthlyFinancialRows(monthlyRows);
        setDailyRevenue(financeiroData.dailyRevenue);
      } catch (err) {
        console.error("Erro ao carregar relatório financeiro:", err);
        setErrorFinancial("Erro ao carregar dados financeiros.");
      } finally {
        setLoadingFinancial(false);
      }
    }

    loadFinancial();
  }, [rangePreset]);
  // Carrega relatório detalhado por profissional
  useEffect(() => {
    async function loadProviders() {
      try {
        setLoadingProviders(true);
        setErrorProviders(null);

        const result = await fetchOwnerProviderEarningsDetailed(rangePreset);

        setProvidersReport(result.items);
        setProvidersTotals(result.totals);
      } catch (err) {
        console.error("Erro ao carregar relatório por profissional:", err);
        setErrorProviders("Erro ao carregar dados de profissionais.");
      } finally {
        setLoadingProviders(false);
      }
    }

    loadProviders();
  }, [rangePreset]);

  // Carrega cancelamentos / no-shows com base no preset + filtro
  useEffect(() => {
    async function loadCancellations() {
      try {
        setLoadingCancellations(true);
        setErrorCancellations(null);

        const items = await fetchOwnerCancellations(
          rangePreset,
          cancellationsFilter
        );

        setCancellations(items);
      } catch (err) {
        console.error("Erro ao carregar cancelamentos/no-shows:", err);
        setErrorCancellations("Erro ao carregar cancelamentos.");
      } finally {
        setLoadingCancellations(false);
      }
    }

    loadCancellations();
  }, [rangePreset, cancellationsFilter]);

  // pontos para o gráfico
  const revenueChartData: RevenueChartPoint[] = useMemo(
    () =>
      dailyRevenue.map((item) => ({
        label: formatDateLabelForPreset(item.date, rangePreset),
        value: item.totalRevenue,
      })),
    [dailyRevenue, rangePreset]
  );

  // KPIs simples do período
  const revenueKpis = useMemo(() => {
    if (!dailyRevenue.length) {
      return {
        totalRevenue: 0,
        averagePerDay: 0,
        activeDays: 0,
      };
    }

    const totalRevenue = dailyRevenue.reduce(
      (acc, item) => acc + item.totalRevenue,
      0
    );
    const activeDays = dailyRevenue.length;
    const averagePerDay = totalRevenue / activeDays;

    return { totalRevenue, averagePerDay, activeDays };
  }, [dailyRevenue]);

  return (
    <>
      {/* Cabeçalho */}
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Relatórios</h1>
          <p className="text-xs text-slate-400">
            Análises detalhadas de faturamento, ocupação e cancelamentos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <select className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200">
            <option>Unidade Demo Barber – Centro</option>
          </select>

          <select
            className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200"
            value={rangePreset}
            onChange={(e) =>
              setRangePreset(e.target.value as ReportsRangePreset)
            }
          >
            <option value="last_30_days">Últimos 30 dias</option>
            <option value="last_90_days">Últimos 90 dias</option>
            <option value="last_12_months">Últimos 12 meses</option>
          </select>

          <button className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80">
            Exportar CSV
          </button>
        </div>
      </header>

      {/* Linha 1: Ocupação + Gráfico de faturamento */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Ocupação e faturamento por profissional (dados reais) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Ocupação por profissional</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ver detalhes
            </button>
          </div>

          {loadingProviders && (
            <p className="text-[11px] text-slate-400">
              Carregando dados dos profissionais...
            </p>
          )}

          {errorProviders && (
            <p className="text-[11px] text-rose-400">{errorProviders}</p>
          )}

          {!loadingProviders && !errorProviders && (
            <>
              {providersReport.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  Nenhum atendimento concluído no período selecionado.
                </p>
              ) : (
                <div className="space-y-2">
                  {providersReport.map((row) => (
                    <div
                      key={row.providerId}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 flex items-center justify-between gap-3"
                    >
                      <div className="flex-1">
                        <p className="text-[11px] font-medium">
                          {row.providerName}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {row.locationName ?? "Sem unidade vinculada"} ·{" "}
                          {row.appointmentsCount} atendimentos
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Ticket médio: € {row.averageTicket.toFixed(2)}
                        </p>

                        <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500/70"
                            style={{
                              width: `${row.occupationPercentage}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="w-20 text-right">
                        <p className="text-[10px] text-slate-400">Ocupação</p>
                        <p className="text-sm font-semibold">
                          {row.occupationPercentage}%
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Profissional: € {row.providerEarnings.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {providersTotals && providersReport.length > 0 && (
                <p className="mt-2 text-[10px] text-slate-500">
                  Total no período — Faturamento: €{" "}
                  {providersTotals.totalRevenue.toFixed(2)} · Profissionais: €{" "}
                  {providersTotals.totalProviderEarnings.toFixed(2)} · Espaço: €{" "}
                  {providersTotals.totalHouseEarnings.toFixed(2)}
                </p>
              )}
            </>
          )}
        </div>

        {/* Faturamento no período + gráfico */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Faturamento no período</p>
            <span className="text-[11px] text-slate-500">
              Serviços concluídos (avulsos + planos)
            </span>
          </div>

          {loadingFinancial && (
            <p className="text-[11px] text-slate-400">
              Carregando dados financeiros...
            </p>
          )}

          {errorFinancial && (
            <p className="text-[11px] text-rose-400">{errorFinancial}</p>
          )}

          {!loadingFinancial && !errorFinancial && (
            <>
              {/* KPIs rápidos */}
              <div className="grid grid-cols-3 gap-3 mb-3 text-[11px]">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2">
                  <p className="text-slate-400">Faturamento total</p>
                  <p className="mt-1 text-sm font-semibold">
                    € {revenueKpis.totalRevenue.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2">
                  <p className="text-slate-400">Média por dia</p>
                  <p className="mt-1 text-sm font-semibold">
                    € {revenueKpis.averagePerDay.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2">
                  <p className="text-slate-400">Dias com movimento</p>
                  <p className="mt-1 text-sm font-semibold">
                    {revenueKpis.activeDays}
                  </p>
                </div>
              </div>

              {/* Gráfico de linha */}
              <RevenueLineChart data={revenueChartData} />
            </>
          )}
        </div>
      </section>

      {/* Linha 3: Detalhamento por profissional (tabela) */}
      <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-slate-400">Detalhamento por profissional</p>
            <p className="text-[10px] text-slate-500">
              Faturamento, comissões e ocupação considerando apenas atendimentos
              concluídos no período selecionado.
            </p>
          </div>

          {/* Futuro: filtros por unidade/profissional */}
          <span className="text-[10px] text-slate-500">
            Período:{" "}
            {rangePreset === "last_30_days"
              ? "últimos 30 dias"
              : rangePreset === "last_90_days"
              ? "últimos 90 dias"
              : "últimos 12 meses"}
          </span>
        </div>

        {loadingProviders && (
          <p className="text-[11px] text-slate-400">
            Carregando dados dos profissionais...
          </p>
        )}

        {errorProviders && (
          <p className="text-[11px] text-rose-400">{errorProviders}</p>
        )}

        {!loadingProviders && !errorProviders && (
          <>
            {providersReport.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                Nenhum atendimento concluído no período selecionado.
              </p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full border-collapse text-[11px] min-w-[720px]">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="text-left py-2 pr-3 border-b border-slate-800">
                        Profissional
                      </th>
                      <th className="text-left py-2 pr-3 border-b border-slate-800">
                        Unidade
                      </th>
                      <th className="text-right py-2 px-3 border-b border-slate-800">
                        Atendimentos
                      </th>
                      <th className="text-right py-2 px-3 border-b border-slate-800">
                        Min. trabalhados
                      </th>
                      <th className="text-right py-2 px-3 border-b border-slate-800">
                        Min. disponíveis
                      </th>
                      <th className="text-right py-2 px-3 border-b border-slate-800">
                        Ocupação
                      </th>
                      <th className="text-right py-2 px-3 border-b border-slate-800">
                        Faturamento
                      </th>
                      <th className="text-right py-2 px-3 border-b border-slate-800">
                        Profissional
                      </th>
                      <th className="text-right py-2 pl-3 border-b border-slate-800">
                        Espaço
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {providersReport.map((row) => (
                      <tr
                        key={row.providerId}
                        className="hover:bg-slate-950/50"
                      >
                        <td className="py-2 pr-3 text-slate-200">
                          {row.providerName}
                        </td>
                        <td className="py-2 pr-3 text-slate-200">
                          {row.locationName ?? "—"}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          {row.appointmentsCount}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          {row.workedMinutes}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          {row.availableMinutes}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          {row.occupationPercentage}%
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          € {row.totalRevenue.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          € {row.providerEarnings.toFixed(2)}
                        </td>
                        <td className="py-2 pl-3 text-right text-slate-200">
                          € {row.houseEarnings.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {providersTotals && providersReport.length > 0 && (
              <p className="mt-2 text-[10px] text-slate-500">
                Totais gerais — Faturamento: €{" "}
                {providersTotals.totalRevenue.toFixed(2)} · Profissionais: €{" "}
                {providersTotals.totalProviderEarnings.toFixed(2)} · Espaço: €{" "}
                {providersTotals.totalHouseEarnings.toFixed(2)}
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
function CancellationTypeBadge({
  status,
}: {
  status: "cancelled" | "no_show";
}) {
  const base = "inline-block px-2 py-[1px] rounded-full text-[9px]";
  if (status === "no_show") {
    return (
      <span className={`${base} bg-rose-500/20 text-rose-100`}>No-show</span>
    );
  }
  return (
    <span className={`${base} bg-amber-500/20 text-amber-100`}>Cancelado</span>
  );
}
