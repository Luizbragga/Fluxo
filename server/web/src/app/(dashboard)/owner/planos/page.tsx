"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchOwnerPlans,
  OwnerPlansData,
  PlanCustomer,
  createOwnerPlanTemplate,
  fetchOwnerServices,
  OwnerService,
} from "../_api/owner-plans";

type FilterStatus = "all" | "active" | "inactive";

export default function OwnerPlanosPage() {
  const searchParams = useSearchParams();
  const locationId = searchParams.get("locationId") ?? undefined;

  const [data, setData] = useState<OwnerPlansData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  // criação de plano
  const [isCreating, setIsCreating] = useState(false);
  const [creatingLoading, setCreatingLoading] = useState(false);
  const [creatingError, setCreatingError] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPrice, setFormPrice] = useState("0");
  const [formVisits, setFormVisits] = useState("2"); // visitas por mês
  const [formMinDaysBetween, setFormMinDaysBetween] = useState("");

  // serviços e desconto
  const [services, setServices] = useState<OwnerService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [applyDiscount, setApplyDiscount] = useState(false);
  const [discountPercent, setDiscountPercent] = useState<5 | 10 | 15>(10);

  const [priceAuto, setPriceAuto] = useState(true);

  // ---------------------------------------------------------------
  // Carrega planos
  // ---------------------------------------------------------------
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

  // ---------------------------------------------------------------
  // Carrega serviços da unidade
  // ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    if (!locationId) {
      setServices([]);
      return;
    }

    async function loadServices() {
      setServicesLoading(true);
      setServicesError(null);
      try {
        const result = await fetchOwnerServices({ locationId });
        if (!cancelled) {
          setServices(result);
        }
      } catch (err: any) {
        if (!cancelled) {
          setServicesError(
            err?.message ?? "Erro ao carregar serviços para montagem do plano."
          );
        }
      } finally {
        if (!cancelled) {
          setServicesLoading(false);
        }
      }
    }

    loadServices();

    return () => {
      cancelled = true;
    };
  }, [locationId]);

  // ---------------------------------------------------------------
  // Cálculo automático do preço (serviços × visitas × desconto)
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!priceAuto) return;

    const visitsNumber = Number(formVisits) || 0;
    if (visitsNumber <= 0) return;

    const selectedServices = services.filter((s) =>
      selectedServiceIds.includes(s.id)
    );
    if (selectedServices.length === 0) return;

    const basePerVisit = selectedServices.reduce(
      (sum, s) => sum + s.priceEuro,
      0
    );

    let raw = basePerVisit * visitsNumber;

    if (applyDiscount && raw > 0) {
      raw = raw * (1 - discountPercent / 100);
    }

    if (raw > 0) {
      setFormPrice(raw.toFixed(2));
    }
  }, [
    priceAuto,
    services,
    selectedServiceIds,
    formVisits,
    applyDiscount,
    discountPercent,
  ]);

  // ---------------------------------------------------------------
  // Derivados para exibição (sugestão)
  // ---------------------------------------------------------------
  const selectedServicesForDisplay = services.filter((s) =>
    selectedServiceIds.includes(s.id)
  );
  const basePerVisit = selectedServicesForDisplay.reduce(
    (sum, s) => sum + s.priceEuro,
    0
  );
  const visitsNumberForCalc = Number(formVisits) || 0;
  const rawSuggested = basePerVisit * visitsNumberForCalc;
  const discountedSuggested =
    applyDiscount && rawSuggested > 0
      ? rawSuggested * (1 - discountPercent / 100)
      : rawSuggested;
  const suggestedPriceDisplay =
    discountedSuggested > 0 ? discountedSuggested.toFixed(2) : null;

  // ---------------------------------------------------------------
  // Submit: criar plano
  // ---------------------------------------------------------------
  async function handleCreatePlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!locationId) {
      setCreatingError(
        "Para criar um plano, abre esta página a partir de uma unidade (location) específica."
      );
      return;
    }

    try {
      setCreatingLoading(true);
      setCreatingError(null);

      const name = formName.trim();
      const description = formDescription.trim() || undefined;

      if (!name) {
        throw new Error("Nome do plano é obrigatório.");
      }

      const priceNumber = Number(formPrice.toString().replace(",", "."));
      if (!priceNumber || priceNumber <= 0) {
        throw new Error("Preço deve ser maior que zero.");
      }

      const visitsNumber = Number(formVisits);
      if (!visitsNumber || visitsNumber <= 0) {
        throw new Error("Número de visitas por mês deve ser maior que zero.");
      }

      if (selectedServiceIds.length === 0) {
        throw new Error("Seleciona pelo menos um serviço para este plano.");
      }

      const minDaysBetweenNumber = formMinDaysBetween
        ? Number(formMinDaysBetween)
        : undefined;

      if (
        formMinDaysBetween &&
        (!minDaysBetweenNumber || minDaysBetweenNumber <= 0)
      ) {
        throw new Error(
          "Intervalo mínimo entre visitas deve ser um número maior que zero."
        );
      }

      const created = await createOwnerPlanTemplate({
        locationId,
        name,
        description,
        priceEuro: priceNumber,
        intervalDays: 30, // ciclo mensal fixo
        visitsPerInterval: visitsNumber,
        sameDayServiceIds: selectedServiceIds,
        minDaysBetweenVisits: minDaysBetweenNumber,
      });

      // Atualiza estado local com o novo plano
      setData((prev) => {
        if (!prev) return prev;

        const newPlanTemplates = [...prev.planTemplates, created].sort((a, b) =>
          a.name.localeCompare(b.name)
        );

        const newPlanStats = [
          ...prev.planStats,
          {
            planId: created.id,
            activeCustomers: 0,
            totalRevenueMonth: 0,
            churnRatePercent: 0,
          },
        ];

        const newPlanCustomersByPlan = {
          ...prev.planCustomersByPlan,
          [created.id]: [],
        };

        return {
          planTemplates: newPlanTemplates,
          planStats: newPlanStats,
          planCustomersByPlan: newPlanCustomersByPlan,
        };
      });

      setSelectedId(created.id);

      // limpa form
      setFormName("");
      setFormDescription("");
      setFormPrice("0");
      setFormVisits("2");
      setFormMinDaysBetween("");
      setSelectedServiceIds([]);
      setApplyDiscount(false);
      setDiscountPercent(10);
      setPriceAuto(true);
      setIsCreating(false);
    } catch (err: any) {
      console.error(err);
      setCreatingError(err?.message ?? "Erro ao criar plano.");
    } finally {
      setCreatingLoading(false);
    }
  }

  // ---------------------------------------------------------------
  // Estados globais de loading/erro
  // ---------------------------------------------------------------
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

  const filteredPlanTemplates = planTemplates.filter((plan) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "active") return plan.isActive;
    return !plan.isActive; // "inactive"
  });

  const selectedPlan = selectedId
    ? planTemplates.find((p) => p.id === selectedId) ?? null
    : null;

  const selectedStats = selectedId
    ? planStats.find((s) => s.planId === selectedId)
    : undefined;

  const customers: PlanCustomer[] = selectedId
    ? planCustomersByPlan[selectedId] ?? []
    : [];

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
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
          <button
            onClick={() => setFilterStatus("all")}
            className={[
              "px-3 py-1 rounded-lg border",
              filterStatus === "all"
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                : "border-slate-800 bg-slate-900/80 text-slate-200 hover:border-slate-700",
            ].join(" ")}
          >
            Todos
          </button>

          <button
            onClick={() => setFilterStatus("active")}
            className={[
              "px-3 py-1 rounded-lg border",
              filterStatus === "active"
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                : "border-slate-800 bg-slate-900/80 text-slate-200 hover:border-slate-700",
            ].join(" ")}
          >
            Ativos
          </button>

          <button
            onClick={() => setFilterStatus("inactive")}
            className={[
              "px-3 py-1 rounded-lg border",
              filterStatus === "inactive"
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                : "border-slate-800 bg-slate-900/80 text-slate-200 hover:border-slate-700",
            ].join(" ")}
          >
            Inativos
          </button>

          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200"
          >
            + Criar plano
          </button>
        </div>
      </header>

      {/* Form de criação */}
      {isCreating && (
        <section className="mb-4 rounded-2xl border border-emerald-700/60 bg-slate-900/70 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold">Criar novo plano</p>
              <p className="text-[11px] text-slate-400">
                Define o nome, os serviços, o número de visitas por mês e o
                valor. Depois evoluímos para regras mais avançadas (horários,
                antecedência mínima, etc.).
              </p>
            </div>
            <button
              type="button"
              onClick={() => !creatingLoading && setIsCreating(false)}
              className="text-[11px] text-slate-300 hover:text-slate-100"
            >
              Cancelar
            </button>
          </div>

          {creatingError && (
            <p className="mb-2 text-[11px] text-rose-300">{creatingError}</p>
          )}

          {!locationId && (
            <p className="mb-2 text-[11px] text-amber-300">
              ⚠ Para criar um plano, abre esta página a partir de uma unidade
              (location) específica.
            </p>
          )}

          <form
            onSubmit={handleCreatePlan}
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            {/* Coluna esquerda: nome, descrição, serviços */}
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-300">
                  Nome do plano
                </label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-300">Descrição</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-300">
                  Serviços incluídos no plano
                </label>
                {servicesLoading ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Carregando serviços...
                  </p>
                ) : servicesError ? (
                  <p className="mt-1 text-[11px] text-rose-300">
                    {servicesError}
                  </p>
                ) : services.length === 0 ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Ainda não há serviços cadastrados nesta unidade.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {services.map((service) => {
                      const checked = selectedServiceIds.includes(service.id);
                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() =>
                            setSelectedServiceIds((prev) =>
                              checked
                                ? prev.filter((id) => id !== service.id)
                                : [...prev, service.id]
                            )
                          }
                          className={[
                            "rounded-full border px-3 py-1 text-[11px]",
                            checked
                              ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                              : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-500",
                          ].join(" ")}
                        >
                          {service.name} · € {service.priceEuro.toFixed(2)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Coluna direita: preço, visitas, intervalo mínimo, desconto */}
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] text-slate-300">
                    Preço final (€)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                    value={formPrice}
                    onChange={(e) => {
                      setFormPrice(e.target.value);
                      setPriceAuto(false); // passa a ser manual
                    }}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-300">
                    Visitas / mês
                  </label>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                    value={formVisits}
                    onChange={(e) => {
                      setFormVisits(e.target.value);
                      setPriceAuto(true); // muda parâmetro -> recalcula
                    }}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-300">
                    Intervalo mín. (dias)
                  </label>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                    placeholder="Opcional"
                    value={formMinDaysBetween}
                    onChange={(e) => setFormMinDaysBetween(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-1 flex items-center justify-between gap-2">
                {suggestedPriceDisplay ? (
                  <p className="text-[11px] text-slate-400">
                    Sugestão: € {suggestedPriceDisplay}{" "}
                    <span className="text-slate-500">
                      (serviços × visitas / mês
                      {applyDiscount ? ` · -${discountPercent}%` : ""})
                    </span>
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Seleciona pelo menos um serviço e nº de visitas para sugerir
                    valor.
                  </p>
                )}

                {suggestedPriceDisplay && (
                  <button
                    type="button"
                    className="text-[11px] text-emerald-400 hover:underline whitespace-nowrap"
                    onClick={() => {
                      setPriceAuto(true);
                      setFormPrice(suggestedPriceDisplay);
                    }}
                  >
                    Usar sugestão
                  </button>
                )}
              </div>

              <div className="mt-1 flex items-center gap-3">
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-slate-600 bg-slate-900"
                    checked={applyDiscount}
                    onChange={(e) => {
                      setApplyDiscount(e.target.checked);
                      setPriceAuto(true);
                    }}
                  />
                  Aplicar desconto
                </label>

                {applyDiscount && (
                  <select
                    className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                    value={discountPercent}
                    onChange={(e) =>
                      setDiscountPercent(Number(e.target.value) as 5 | 10 | 15)
                    }
                  >
                    <option value={5}>5%</option>
                    <option value={10}>10%</option>
                    <option value={15}>15%</option>
                  </select>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={creatingLoading || !locationId}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-[11px] font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {creatingLoading ? "Criando..." : "Salvar plano"}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

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
            {filteredPlanTemplates.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                Nenhum plano encontrado para este filtro.
              </p>
            ) : (
              filteredPlanTemplates.map((plan) => {
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
                    {selectedPlan.minDaysBetweenVisits && (
                      <p className="text-[10px] text-slate-500">
                        Intervalo mínimo entre visitas:{" "}
                        {selectedPlan.minDaysBetweenVisits} dias
                      </p>
                    )}
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
