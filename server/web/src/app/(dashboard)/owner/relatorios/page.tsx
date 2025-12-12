// src/app/(dashboard)/owner/relatorios/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchOwnerMonthlyFinancial,
  type MonthlyFinancialRow,
  type ReportsRangePreset,
  fetchOwnerCancellations,
  type CancellationItem,
} from "../_api/owner-reports";

import {
  fetchOwnerFinanceiroWithRange,
  type DailyRevenueItem,
} from "../_api/owner-financeiro";
import {
  RevenueLineChart,
  type RevenueChartPoint,
} from "../_components/revenue-line-chart";

// ----------------- Tipos locais (mock de ocupação por enquanto) -----------------

type OccupancyRow = {
  professionalName: string;
  averageOccupationPercent: number;
  peakWeekday: string;
  peakHourRange: string;
};

const occupancyData: OccupancyRow[] = [
  {
    professionalName: "Rafa Barber",
    averageOccupationPercent: 82,
    peakWeekday: "Sábado",
    peakHourRange: "10h–14h",
  },
  {
    professionalName: "João Fade",
    averageOccupationPercent: 68,
    peakWeekday: "Sexta-feira",
    peakHourRange: "16h–20h",
  },
  {
    professionalName: "Ana Nails",
    averageOccupationPercent: 54,
    peakWeekday: "Quinta-feira",
    peakHourRange: "14h–18h",
  },
];

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
        {/* Ocupação por profissional (mock por enquanto) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Ocupação por profissional</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ver detalhes
            </button>
          </div>

          <div className="space-y-2">
            {occupancyData.map((row) => (
              <div
                key={row.professionalName}
                className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 flex items-center justify-between gap-3"
              >
                <div className="flex-1">
                  <p className="text-[11px] font-medium">
                    {row.professionalName}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Pico: {row.peakWeekday} · {row.peakHourRange}
                  </p>
                  <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500/70"
                      style={{ width: `${row.averageOccupationPercent}%` }}
                    />
                  </div>
                </div>
                <div className="w-16 text-right">
                  <p className="text-[10px] text-slate-400">Ocupação</p>
                  <p className="text-sm font-semibold">
                    {row.averageOccupationPercent}%
                  </p>
                </div>
              </div>
            ))}
          </div>
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

      {/* Linha 2: Relatório mensal + Cancelamentos/no-shows */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Relatório financeiro mensal (dados reais) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Relatório financeiro mensal</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Abrir em financeiro
            </button>
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
              <div className="overflow-auto">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="text-left py-2 pr-3 border-b border-slate-800">
                        Mês
                      </th>
                      <th className="text-right py-2 px-3 border-b border-slate-800">
                        Faturamento
                      </th>
                      <th className="text-right py-2 px-3 border-b border-slate-800">
                        Espaço
                      </th>
                      <th className="text-right py-2 px-3 border-b border-slate-800">
                        Profissionais
                      </th>
                      <th className="text-right py-2 pl-3 border-b border-slate-800">
                        Perda c/ no-shows
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyFinancialRows.map((row) => (
                      <tr
                        key={row.monthLabel}
                        className="hover:bg-slate-950/50"
                      >
                        <td className="py-2 pr-3 text-slate-200">
                          {row.monthLabel}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          € {row.totalRevenue.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          € {row.spaceShare.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          € {row.professionalsShare.toFixed(2)}
                        </td>
                        <td className="py-2 pl-3 text-right text-amber-300">
                          € {row.estimatedLossNoShow.toFixed(2)}
                        </td>
                      </tr>
                    ))}

                    {monthlyFinancialRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-3 text-center text-slate-500"
                        >
                          Nenhum dado financeiro no período selecionado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="mt-2 text-[10px] text-slate-500">
                Valores baseados em relatórios agregados de faturamento e
                comissões. A coluna de perdas com no-show será ligada ao backend
                quando tivermos essa métrica registrada.
              </p>
            </>
          )}
        </div>

        {/* Cancelamentos e no-shows (dados reais) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Cancelamentos e no-shows</p>
            <div className="flex gap-2">
              {(["all", "no_show", "cancelled"] as const).map((filterKey) => {
                const label =
                  filterKey === "all"
                    ? "Todos"
                    : filterKey === "no_show"
                    ? "No-show"
                    : "Cancelado";

                const isActive = cancellationsFilter === filterKey;

                return (
                  <button
                    key={filterKey}
                    onClick={() => setCancellationsFilter(filterKey)}
                    className={[
                      "px-3 py-1 rounded-lg border text-xs transition-colors",
                      isActive
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
                        : "border-slate-800 bg-slate-950/80 text-slate-200",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {loadingCancellations && (
            <p className="text-[11px] text-slate-400">
              Carregando cancelamentos...
            </p>
          )}

          {errorCancellations && (
            <p className="text-[11px] text-rose-400">{errorCancellations}</p>
          )}

          {!loadingCancellations && !errorCancellations && (
            <div className="overflow-auto max-h-80 pr-1">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="text-slate-400">
                    <th className="text-left py-2 pr-3 border-b border-slate-800">
                      Data
                    </th>
                    <th className="text-left py-2 pr-3 border-b border-slate-800">
                      Cliente
                    </th>
                    <th className="text-left py-2 pr-3 border-b border-slate-800">
                      Profissional
                    </th>
                    <th className="text-left py-2 pr-3 border-b border-slate-800">
                      Serviço
                    </th>
                    <th className="text-left py-2 pr-3 border-b border-slate-800">
                      Tipo
                    </th>
                    <th className="text-left py-2 pl-3 border-b border-slate-800">
                      Motivo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cancellations.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-3 text-center text-slate-500"
                      >
                        Nenhum cancelamento ou no-show no período.
                      </td>
                    </tr>
                  ) : (
                    cancellations.map((row) => {
                      const d = new Date(row.date);
                      const dateLabel = d.toLocaleDateString("pt-PT", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      });
                      const timeLabel = d.toLocaleTimeString("pt-PT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });

                      return (
                        <tr key={row.id} className="hover:bg-slate-950/50">
                          <td className="py-2 pr-3 text-slate-200">
                            {dateLabel} · {timeLabel}
                          </td>
                          <td className="py-2 pr-3 text-slate-200">
                            {row.customerName ?? "—"}
                          </td>
                          <td className="py-2 pr-3 text-slate-200">
                            {row.professionalName ?? "—"}
                          </td>
                          <td className="py-2 pr-3 text-slate-200">
                            {row.serviceName ?? "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <CancellationTypeBadge status={row.status} />
                          </td>
                          <td className="py-2 pl-3 text-slate-400">
                            {row.reason ?? "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
