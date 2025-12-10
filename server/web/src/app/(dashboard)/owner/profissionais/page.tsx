"use client";

import { useEffect, useState } from "react";
import {
  fetchOwnerProfessionals,
  fetchOwnerProviderEarnings,
  fetchOwnerProviderCommissions,
  type OwnerProfessional,
  type OwnerProviderEarningsItem,
  type OwnerProviderCommission,
} from "../_api/owner-professionals";

// --- Tipos de resumo (por enquanto ainda mockados) ---------------------------

type ProfessionalSummary = {
  id: string;
  totalAppointmentsMonth: number;
  totalRevenueMonth: number;
  professionalShareMonth: number;
  spaceShareMonth: number;
};

type ProfessionalPayoutSummary = {
  id: string;
  periodLabel: string;
  amount: number;
  status: "pending" | "paid";
};

// Mock fixo só para a caixinha de “Repasses recentes”.
// Depois vamos ligar isso no financeiro real.
const payoutSummaries: ProfessionalPayoutSummary[] = [
  {
    id: "1",
    periodLabel: "Período 18–24 Nov · 12 atendimentos",
    amount: 210,
    status: "pending",
  },
  {
    id: "2",
    periodLabel: "Período 11–17 Nov · pago",
    amount: 180,
    status: "paid",
  },
];

// gera um resumo “bonitinho” a partir da posição na lista,
// só pra não ficar tudo 0 enquanto o endpoint de analytics não existe
function buildMockSummaryFor(
  professional: OwnerProfessional,
  index: number
): ProfessionalSummary {
  const baseAppointments = 40 + index * 12;
  const totalRevenueMonth = 1000 + index * 450;
  const professionalShareMonth = Math.round(totalRevenueMonth * 0.6);
  const spaceShareMonth = totalRevenueMonth - professionalShareMonth;

  return {
    id: professional.id,
    totalAppointmentsMonth: baseAppointments,
    totalRevenueMonth,
    professionalShareMonth,
    spaceShareMonth,
  };
}

export default function OwnerProfessionalsPage() {
  const [professionals, setProfessionals] = useState<OwnerProfessional[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerEarnings, setProviderEarnings] = useState<
    OwnerProviderEarningsItem[]
  >([]);
  const [commissions, setCommissions] = useState<OwnerProviderCommission[]>([]);

  // carrega profissionais reais do tenant
  // carrega profissionais reais do tenant + earnings agregados
  useEffect(() => {
    async function load() {
      try {
        // 1) Profissionais (lista principal)
        const data = await fetchOwnerProfessionals();
        setProfessionals(data);
        setSelectedId(data[0]?.id ?? null);
        setError(null);
      } catch (err: any) {
        console.error(err);
        setError(
          err?.message ?? "Erro ao carregar profissionais. Tente novamente."
        );
      } finally {
        setLoading(false);
      }

      // 2) Earnings por provider (não bloqueia a tela se der erro)
      try {
        const earnings = await fetchOwnerProviderEarnings();
        setProviderEarnings(earnings);
      } catch (err) {
        console.error(
          "Falha ao carregar resumo financeiro dos providers:",
          err
        );
        // se falhar, seguimos usando o mock para os cards
      }
    }

    load();
  }, []); // sem dependências
  // carrega regras de comissão sempre que o profissional selecionado muda
  useEffect(() => {
    if (!selectedId) {
      setCommissions([]);
      return;
    }

    async function loadCommissions() {
      try {
        const data = await fetchOwnerProviderCommissions(selectedId!);
        setCommissions(data);
      } catch (err) {
        console.error("Erro ao carregar comissões do provider:", err);
        // se der erro, mantemos lista vazia para não quebrar a tela
        setCommissions([]);
      }
    }

    loadCommissions();
  }, [selectedId]);

  const selectedProfessional =
    professionals.find((p) => p.id === selectedId) ?? null;

  const selectedIndex = professionals.findIndex((p) => p.id === selectedId);

  // earnings reais para o profissional selecionado (se existir no relatório)
  const selectedEarnings =
    selectedProfessional &&
    providerEarnings.find((e) => e.providerId === selectedProfessional.id);

  const selectedSummary: ProfessionalSummary | null = selectedProfessional
    ? selectedEarnings
      ? {
          id: selectedProfessional.id,
          totalAppointmentsMonth: selectedEarnings.appointmentsCount,
          totalRevenueMonth: Math.round(
            selectedEarnings.servicePriceCents / 100
          ),
          professionalShareMonth: Math.round(
            selectedEarnings.providerEarningsCents / 100
          ),
          spaceShareMonth: Math.round(
            selectedEarnings.houseEarningsCents / 100
          ),
        }
      : selectedIndex >= 0
      ? buildMockSummaryFor(selectedProfessional, selectedIndex)
      : null
    : null;

  return (
    <>
      {/* Cabeçalho */}
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Profissionais</h1>
          <p className="text-xs text-slate-400">
            Gestão da equipa, ocupação, comissões e repasses.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <select className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200">
            <option>Unidade atual do tenant</option>
          </select>
          <button className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200">
            + Adicionar profissional
          </button>
        </div>
      </header>

      {/* Grid principal: lista + detalhes */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lista de profissionais */}
        <div className="lg:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3 text-xs">
            <p className="text-slate-400">Lista de profissionais</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ver todos os estados
            </button>
          </div>

          <div className="mb-3">
            <input
              placeholder="Buscar por nome ou especialidade..."
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {loading ? (
            <p className="text-xs text-slate-400">Carregando profissionais…</p>
          ) : error ? (
            <p className="text-xs text-rose-400">
              Erro ao carregar profissionais: {error}
            </p>
          ) : professionals.length === 0 ? (
            <p className="text-xs text-slate-400">
              Nenhum profissional cadastrado neste tenant ainda.
            </p>
          ) : (
            <div className="space-y-2 text-xs">
              {professionals.map((pro) => {
                const isSelected = pro.id === selectedId;

                return (
                  <button
                    key={pro.id}
                    onClick={() => setSelectedId(pro.id)}
                    className={[
                      "w-full text-left rounded-xl border px-3 py-2 transition-colors",
                      isSelected
                        ? "border-emerald-500/60 bg-emerald-500/5"
                        : "border-slate-800 bg-slate-950/60 hover:border-slate-700",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-[13px]">{pro.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {pro.specialty}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {pro.locationName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-slate-400">Ocupação</p>
                        <p className="text-sm font-semibold">
                          {pro.averageOccupation}%
                        </p>
                        <span
                          className={[
                            "inline-flex mt-1 rounded-full px-2 py-[1px] text-[9px]",
                            pro.isActive
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-slate-700 text-slate-200",
                          ].join(" ")}
                        >
                          {pro.isActive ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detalhes do profissional selecionado */}
        <div className="lg:col-span-2 space-y-4">
          {/* Resumo superior */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            {selectedProfessional && selectedSummary ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-slate-400">Profissional</p>
                    <p className="text-sm font-semibold">
                      {selectedProfessional.name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {selectedProfessional.specialty} ·{" "}
                      {selectedProfessional.locationName}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-slate-400">Ocupação média</p>
                    <p className="text-lg font-semibold">
                      {selectedProfessional.averageOccupation}%
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Atendimentos (mês)
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {selectedSummary.totalAppointmentsMonth}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Receita total (mês)
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      € {selectedSummary.totalRevenueMonth}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Parte do profissional
                    </p>
                    <p className="mt-1 text-lg font-semibold text-emerald-300">
                      € {selectedSummary.professionalShareMonth}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Parte do espaço
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      € {selectedSummary.spaceShareMonth}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">
                Selecione um profissional na lista ao lado para ver o resumo.
              </p>
            )}
          </div>

          {/* Repasses / comissão */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400">Repasses recentes</p>
                <button className="text-[11px] text-emerald-400 hover:underline">
                  Ver todos
                </button>
              </div>
              <div className="space-y-2">
                {!selectedProfessional ? (
                  <p className="text-[11px] text-slate-400">
                    Selecione um profissional para ver as regras de comissão.
                  </p>
                ) : commissions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-700/80 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-500">
                    Nenhuma regra de comissão configurada ainda para{" "}
                    <span className="font-medium text-slate-300">
                      {selectedProfessional.name}
                    </span>
                    .{" "}
                    <span className="block mt-1">
                      Use o botão{" "}
                      <span className="font-semibold">“Gerir comissão”</span>{" "}
                      para definir as regras padrão ou por serviço.
                    </span>
                  </div>
                ) : (
                  commissions.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"
                    >
                      <p className="text-[11px] text-slate-300">
                        {c.service?.name ?? "Regra padrão (todos os serviços)"}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {c.percentage}% do valor do serviço para o profissional
                      </p>
                      {!c.active && (
                        <p className="mt-1 text-[10px] text-slate-500">
                          Regra inativa
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400">Regras de comissão</p>
                <button className="text-[11px] text-emerald-400 hover:underline">
                  Gerir comissão
                </button>
              </div>
              <div className="space-y-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <p className="text-[11px] text-slate-300">Corte masculino</p>
                  <p className="text-[11px] text-slate-400">
                    50% do valor do serviço para o profissional
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <p className="text-[11px] text-slate-300">
                    Serviços de plano
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Comissão fixa por visita ou percentagem do plano
                  </p>
                </div>
                <div className="rounded-xl border border-dashed border-slate-700/80 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-500">
                  Depois vamos puxar essas regras de{" "}
                  <span className="font-mono text-[10px]">
                    ProviderCommission
                  </span>{" "}
                  e permitir edição visual aqui.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
