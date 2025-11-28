"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchOwnerServices,
  type OwnerService,
  type OwnerServiceStats,
  createOwnerService,
  fetchOwnerLocations,
  type OwnerLocation,
} from "../_api/owner-services";

export default function OwnerServicosPage() {
  const searchParams = useSearchParams();
  const locationId = searchParams.get("locationId");

  const [services, setServices] = useState<OwnerService[]>([]);
  const [stats, setStats] = useState<OwnerServiceStats[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // estado do formulário de criação
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDuration, setCreateDuration] = useState<string>(""); // duração como string
  const [createBasePrice, setCreateBasePrice] = useState<string>(""); // preço como string
  const [isSaving, setIsSaving] = useState(false);

  // unidades (locations) disponíveis para o tenant
  const [locations, setLocations] = useState<OwnerLocation[]>([]);
  const [createLocationId, setCreateLocationId] = useState<string>("");

  // carrega serviços (filtrando por locationId se vier na URL)
  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        setError(null);

        const { services, stats } = await fetchOwnerServices(
          locationId ?? undefined
        );
        setServices(services);
        setStats(stats);
        setSelectedId((prev) => prev ?? services[0]?.id ?? null);
      } catch (err: any) {
        const message =
          err?.message ??
          "Erro desconhecido ao carregar serviços. Verificar console.";
        setError(message);
        console.error("Erro ao buscar serviços:", err);
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [locationId]);

  // carrega lista de locations do tenant (para o select do formulário)
  useEffect(() => {
    async function loadLocations() {
      try {
        const locs = await fetchOwnerLocations();
        setLocations(locs);

        if (locs.length > 0) {
          // se já veio locationId na URL, usamos como default
          setCreateLocationId((prev) => prev || locationId || locs[0].id);
        }
      } catch (err) {
        console.error("Erro ao carregar locations:", err);
      }
    }

    loadLocations();
  }, [locationId]);

  async function handleCreateService(e: React.FormEvent) {
    e.preventDefault();

    if (!createLocationId) {
      setError("Seleciona uma unidade para salvar o serviço.");
      return;
    }

    if (!createName.trim()) {
      setError("Dá um nome para o serviço antes de salvar.");
      return;
    }

    // converte duração para número
    const duration = Number(createDuration);
    if (!createDuration || Number.isNaN(duration) || duration < 5) {
      setError("A duração mínima do serviço é de 5 minutos.");
      return;
    }

    // converte preço base: vazio significa 0
    const basePrice =
      createBasePrice.trim() === ""
        ? 0
        : Number(createBasePrice.replace(",", "."));

    if (Number.isNaN(basePrice) || basePrice < 0) {
      setError("Preço base inválido.");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      await createOwnerService({
        name: createName.trim(),
        durationMinutes: duration,
        basePrice,
        locationId: createLocationId,
      });

      setCreateName("");
      setCreateDuration("");
      setCreateBasePrice("");

      // recarrega lista
      const { services: updatedServices, stats: updatedStats } =
        await fetchOwnerServices(locationId ?? undefined);

      setServices(updatedServices);
      setStats(updatedStats);
      setSelectedId((prev) => prev ?? updatedServices[0]?.id ?? null);

      // fecha o form depois de salvar
      setShowCreateForm(false);
    } catch (err: any) {
      const message =
        err?.message ?? "Erro ao salvar serviço. Verificar console.";
      setError(message);
      console.error("Erro ao criar serviço:", err);
    } finally {
      setIsSaving(false);
    }
  }

  // serviço / stats selecionados
  const selectedService = services.find((s) => s.id === selectedId) ?? null;
  const selectedStats =
    selectedService != null
      ? stats.find((st) => st.serviceId === selectedService.id) ?? null
      : null;

  // validação da duração (para o botão ficar habilitado)
  const durationNumber = Number(createDuration);
  const isDurationValid =
    createDuration !== "" &&
    !Number.isNaN(durationNumber) &&
    durationNumber >= 5;

  return (
    <>
      {/* Cabeçalho */}
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Serviços</h1>
          <p className="text-xs text-slate-400">
            Catálogo de serviços, duração, preços e ligação futura com planos e
            comissões.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <select className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200">
            <option>Todas as categorias</option>
            <option>Cabelo</option>
            <option>Barba</option>
            <option>Nails</option>
          </select>
          <button
            type="button"
            className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200"
            onClick={() => {
              const next = !showCreateForm;
              setShowCreateForm(next);

              if (next) {
                const el = document.getElementById("novo-servico-form");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
          >
            {showCreateForm ? "Fechar criação" : "+ Adicionar serviço"}
          </button>
        </div>
      </header>

      {/* Aviso quando não há locations */}
      {locations.length === 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-900/30 px-3 py-2 text-[11px] text-amber-100">
          Ainda não há nenhuma unidade (location) criada para este espaço. Cria
          primeiro as unidades no módulo de Locations para poder cadastrar
          serviços vinculados.
        </div>
      )}

      {/* Formulário de criação de serviço */}
      {showCreateForm && (
        <section
          id="novo-servico-form"
          className="mb-4 rounded-2xl border border-emerald-700/50 bg-slate-900/70 p-4 text-xs"
        >
          <p className="mb-1 text-[11px] font-semibold text-slate-200">
            Adicionar novo serviço
          </p>
          <p className="mb-3 text-[11px] text-slate-400">
            Define o nome, a duração e o preço base. Depois conectamos com
            planos e comissões.
          </p>

          <form
            onSubmit={handleCreateService}
            className="grid grid-cols-1 gap-3 md:grid-cols-3"
          >
            <div className="md:col-span-1">
              <label className="mb-1 block text-[11px] text-slate-400">
                Unidade (location)
              </label>
              <select
                value={createLocationId}
                onChange={(e) => setCreateLocationId(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">Seleciona uma unidade...</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-1">
              <label className="mb-1 block text-[11px] text-slate-400">
                Nome do serviço
              </label>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Corte masculino, Barba, etc."
                className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-slate-400">
                Duração (min)
              </label>
              <input
                type="number"
                min={5}
                max={480}
                value={createDuration}
                onChange={(e) => {
                  setCreateDuration(e.target.value);
                }}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-slate-400">
                Preço base (€)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={createBasePrice}
                  onChange={(e) => {
                    setCreateBasePrice(e.target.value);
                  }}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />

                <button
                  type="submit"
                  disabled={
                    !createLocationId ||
                    isSaving ||
                    !createName.trim() ||
                    !isDurationValid
                  }
                  className={[
                    "whitespace-nowrap rounded-lg px-4 py-2 text-[11px] font-semibold transition-colors",
                    !createLocationId || isSaving
                      ? "cursor-not-allowed border border-slate-700 bg-slate-800/60 text-slate-400"
                      : "border border-emerald-600 bg-emerald-600/80 text-emerald-50 hover:bg-emerald-500",
                  ].join(" ")}
                >
                  {!createLocationId
                    ? "Seleciona uma unidade"
                    : isSaving
                    ? "Salvando..."
                    : "Salvar serviço"}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* Banner de erro da API */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-[11px] text-red-200">
          Erro: {error}
        </div>
      )}

      {/* Grid principal: lista + detalhes */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Lista de serviços */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between text-xs">
            <p className="text-slate-400">Lista de serviços</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ordenar
            </button>
          </div>

          <div className="mb-3">
            <input
              placeholder="Buscar por nome ou categoria..."
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {isLoading ? (
            <p className="text-[11px] text-slate-500">Carregando serviços...</p>
          ) : services.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Ainda não há serviços cadastrados para este espaço.
            </p>
          ) : (
            <div className="space-y-2 text-xs">
              {services.map((service) => {
                const isSelected = service.id === selectedId;
                const statsForService = stats.find(
                  (st) => st.serviceId === service.id
                );

                return (
                  <button
                    key={service.id}
                    onClick={() => setSelectedId(service.id)}
                    className={[
                      "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                      isSelected
                        ? "border-emerald-500/60 bg-emerald-500/5"
                        : "border-slate-800 bg-slate-950/60 hover:border-slate-700",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-medium">
                          {service.name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {service.category ?? "Serviço"} ·{" "}
                          {service.durationMinutes} min
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Base: € {service.basePrice.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        {statsForService && (
                          <>
                            <p className="text-[11px] text-slate-400">
                              Usos (mês)
                            </p>
                            <p className="text-sm font-semibold">
                              {statsForService.timesBookedMonth}
                            </p>
                          </>
                        )}
                        <span
                          className={[
                            "mt-1 inline-flex rounded-full px-2 py-[1px] text-[9px]",
                            service.isActive
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-slate-700 text-slate-200",
                          ].join(" ")}
                        >
                          {service.isActive ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detalhes do serviço selecionado */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
            {selectedService ? (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-slate-400">
                      Serviço selecionado
                    </p>
                    <p className="text-sm font-semibold">
                      {selectedService.name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {selectedService.category ?? "Serviço"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-400">Duração padrão</p>
                    <p className="text-lg font-semibold">
                      {selectedService.durationMinutes} min
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Preço base: € {selectedService.basePrice.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">Estado</p>
                    <p className="mt-1 text-sm font-semibold">
                      {selectedService.isActive ? "Ativo" : "Inativo"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Depois vamos permitir ativar/desativar aqui.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Elegível para planos?
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {selectedService.isPlanEligible ? "Sim" : "Não definido"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Mais à frente ligamos isso com os{" "}
                      <span className="font-mono text-[10px]">
                        PlanTemplate
                      </span>{" "}
                      no backend.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Integração com comissão
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      ProviderCommission
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      No futuro, vamos conectar este serviço às regras de
                      comissão por profissional.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">
                Selecione um serviço na lista ao lado para ver detalhes.
              </p>
            )}
          </div>

          {/* Estatísticas do serviço */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-slate-400">Estatísticas do serviço</p>
              <button className="text-[11px] text-emerald-400 hover:underline">
                Ver no relatório
              </button>
            </div>

            {selectedStats ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[11px] text-slate-400">
                    Atendimentos no mês
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {selectedStats.timesBookedMonth}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[11px] text-slate-400">
                    Receita gerada (mês)
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    € {selectedStats.revenueMonth}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[11px] text-slate-400">
                    Ticket médio com este serviço
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    € {selectedStats.averageTicketWhenUsed}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">
                Ainda não há dados suficientes para este serviço. Assim que
                ligarmos os relatórios, estes números vão ser calculados a
                partir dos agendamentos reais.
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
