"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  fetchOwnerServices,
  type OwnerService,
  type OwnerServiceStats,
  createOwnerService,
  fetchOwnerLocations,
  type OwnerLocation,
  updateOwnerServiceActive,
  updateOwnerServiceInfo,
  fetchOwnerServicePlanUsage,
  type OwnerServicePlanUsage,
  updateOwnerServiceNotes,
} from "../_api/owner-services";

const NO_CATEGORY_VALUE = "__NO_CATEGORY__";

export default function OwnerServicosPage() {
  const searchParams = useSearchParams();
  const locationId = searchParams.get("locationId");
  const router = useRouter();

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
  const [isTogglingActive, setIsTogglingActive] = useState(false);

  const [createCategoryExisting, setCreateCategoryExisting] =
    useState<string>("");
  const [createNewCategory, setCreateNewCategory] = useState<string>("");

  // edição do serviço selecionado
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDuration, setEditDuration] = useState<string>("");
  const [editBasePrice, setEditBasePrice] = useState<string>("");
  const [editCategoryExisting, setEditCategoryExisting] = useState<string>("");
  const [editNewCategory, setEditNewCategory] = useState<string>("");

  // uso deste serviço em planos
  const [planUsage, setPlanUsage] = useState<OwnerServicePlanUsage | null>(
    null
  );
  const [isLoadingPlanUsage, setIsLoadingPlanUsage] = useState(false);

  // notas internas do serviço
  const [notes, setNotes] = useState<string>("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  // unidades (locations) disponíveis para o tenant
  const [locations, setLocations] = useState<OwnerLocation[]>([]);
  const [createLocationId, setCreateLocationId] = useState<string>("");

  const [filterCategory, setFilterCategory] = useState<string>("");
  const [sortOption, setSortOption] = useState<
    | "name_asc"
    | "name_desc"
    | "price_asc"
    | "price_desc"
    | "usage_desc"
    | "usage_asc"
  >("name_asc");

  // serviço / stats selecionados (derivados do estado)
  const selectedService = services.find((s) => s.id === selectedId) ?? null;

  const selectedStats =
    selectedService != null
      ? stats.find((st) => st.serviceId === selectedService.id) ?? null
      : null;

  // quando muda o serviço selecionado, sincroniza o campo de notas
  useEffect(() => {
    if (selectedService) {
      setNotes(selectedService.notes ?? "");
    } else {
      setNotes("");
    }

    // sempre que trocar o serviço selecionado, sai do modo edição
    setIsEditingNotes(false);
  }, [selectedService]);

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

    void load();
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

    void loadLocations();
  }, [locationId]);

  // carrega em quais planos o serviço selecionado está presente
  useEffect(() => {
    async function loadPlanUsage() {
      if (!selectedId) {
        setPlanUsage(null);
        return;
      }

      try {
        setIsLoadingPlanUsage(true);
        const data = await fetchOwnerServicePlanUsage(selectedId);
        setPlanUsage(data);
      } catch (err) {
        console.error("Erro ao carregar planos do serviço:", err);
        // não precisa setar erro global, é só info extra
      } finally {
        setIsLoadingPlanUsage(false);
      }
    }

    void loadPlanUsage();
  }, [selectedId]);

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

    // decide categoria: nova digitada > existente > null
    const finalCategory =
      createNewCategory.trim() !== ""
        ? createNewCategory.trim()
        : createCategoryExisting || null;

    try {
      setIsSaving(true);
      setError(null);

      await createOwnerService({
        name: createName.trim(),
        durationMinutes: duration,
        basePrice,
        locationId: createLocationId,
        category: finalCategory,
      });

      setCreateName("");
      setCreateDuration("");
      setCreateBasePrice("");
      setCreateCategoryExisting("");
      setCreateNewCategory("");

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

  // categorias distintas presentes nos serviços
  const categories = Array.from(
    new Set(
      services
        .map((s) => s.category)
        .filter((c): c is string => !!c && c.trim() !== "")
    )
  );

  // serviços filtrados pela categoria selecionada
  const filteredServices = services.filter((service) => {
    if (!filterCategory) return true; // todas
    if (filterCategory === NO_CATEGORY_VALUE) {
      return !service.category || service.category.trim() === "";
    }
    return service.category === filterCategory;
  });

  // serviços ordenados de acordo com a opção selecionada
  const sortedServices = [...filteredServices].sort((a, b) => {
    switch (sortOption) {
      case "price_asc":
        return a.basePrice - b.basePrice;

      case "price_desc":
        return b.basePrice - a.basePrice;

      case "name_desc":
        return a.name.localeCompare(b.name) * -1;

      case "usage_desc": {
        const aStats =
          stats.find((st) => st.serviceId === a.id)?.timesBookedMonth ?? 0;
        const bStats =
          stats.find((st) => st.serviceId === b.id)?.timesBookedMonth ?? 0;
        return bStats - aStats; // mais usados primeiro
      }

      case "usage_asc": {
        const aStats =
          stats.find((st) => st.serviceId === a.id)?.timesBookedMonth ?? 0;
        const bStats =
          stats.find((st) => st.serviceId === b.id)?.timesBookedMonth ?? 0;
        return aStats - bStats; // menos usados primeiro
      }

      case "name_asc":
      default:
        return a.name.localeCompare(b.name);
    }
  });

  // validação da duração (para o botão ficar habilitado)
  const durationNumber = Number(createDuration);
  const isDurationValid =
    createDuration !== "" &&
    !Number.isNaN(durationNumber) &&
    durationNumber >= 5;

  async function handleToggleActive(service: OwnerService) {
    try {
      setIsTogglingActive(true);
      setError(null);

      const updated = await updateOwnerServiceActive({
        id: service.id,
        isActive: !service.isActive,
      });

      // Atualiza o array de serviços em memória
      setServices((prev) =>
        prev.map((s) =>
          s.id === service.id ? { ...s, isActive: updated.isActive } : s
        )
      );
    } catch (err: any) {
      console.error("Erro ao atualizar estado do serviço:", err);
      const message =
        err?.message ?? "Erro ao ativar/desativar serviço. Verificar console.";
      setError(message);
    } finally {
      setIsTogglingActive(false);
    }
  }

  async function handleSaveNotes() {
    if (!selectedService) return;

    try {
      setIsSavingNotes(true);
      setError(null);

      const trimmed = notes.trim();
      const updated = await updateOwnerServiceNotes({
        id: selectedService.id,
        notes: trimmed === "" ? null : trimmed,
      });

      // atualiza lista em memória
      setServices((prev) =>
        prev.map((s) =>
          s.id === updated.id ? { ...s, notes: updated.notes ?? null } : s
        )
      );
      setIsEditingNotes(false);
    } catch (err: any) {
      console.error("Erro ao salvar notas do serviço:", err);
      const message =
        err?.message ?? "Erro ao salvar notas. Verificar console.";
      setError(message);
    } finally {
      setIsSavingNotes(false);
    }
  }

  async function handleUpdateService() {
    if (!selectedService) return;

    // validações parecidas com o create
    if (!editName.trim()) {
      setError("Dá um nome para o serviço antes de salvar.");
      return;
    }

    const duration = Number(editDuration);
    if (!editDuration || Number.isNaN(duration) || duration < 5) {
      setError("A duração mínima do serviço é de 5 minutos.");
      return;
    }

    const basePrice =
      editBasePrice.trim() === "" ? 0 : Number(editBasePrice.replace(",", "."));

    if (Number.isNaN(basePrice) || basePrice < 0) {
      setError("Preço base inválido.");
      return;
    }

    const finalCategory =
      editNewCategory.trim() !== ""
        ? editNewCategory.trim()
        : editCategoryExisting || null;

    try {
      setIsUpdating(true);
      setError(null);

      const updated = await updateOwnerServiceInfo({
        id: selectedService.id,
        name: editName.trim(),
        durationMinutes: duration,
        basePrice,
        category: finalCategory,
      });

      // atualiza o array de serviços mantendo outros campos
      setServices((prev) =>
        prev.map((s) =>
          s.id === updated.id
            ? {
                ...s,
                name: updated.name,
                durationMinutes: updated.durationMinutes,
                basePrice: updated.basePrice,
                category: updated.category ?? null,
              }
            : s
        )
      );

      setIsEditing(false);
    } catch (err: any) {
      console.error("Erro ao atualizar serviço:", err);
      const message =
        err?.message ?? "Erro ao atualizar serviço. Verificar console.";
      setError(message);
    } finally {
      setIsUpdating(false);
    }
  }

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
          <select
            className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">Todas as categorias</option>
            <option value={NO_CATEGORY_VALUE}>Sem categoria</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
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
            className="grid grid-cols-1 gap-3 md:grid-cols-4"
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

            <div className="md:col-span-1">
              <label className="mb-1 block text-[11px] text-slate-400">
                Categoria (opcional)
              </label>

              <select
                value={createCategoryExisting}
                onChange={(e) => setCreateCategoryExisting(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">Sem categoria</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <input
                value={createNewCategory}
                onChange={(e) => setCreateNewCategory(e.target.value)}
                placeholder="Ou cria uma nova categoria..."
                className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
                onChange={(e) => setCreateDuration(e.target.value)}
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
                  onChange={(e) => setCreateBasePrice(e.target.value)}
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
            <select
              value={sortOption}
              onChange={(e) =>
                setSortOption(e.target.value as typeof sortOption)
              }
              className="rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="name_asc">Nome (A → Z)</option>
              <option value="name_desc">Nome (Z → A)</option>
              <option value="price_asc">Preço (menor → maior)</option>
              <option value="price_desc">Preço (maior → menor)</option>
              <option value="usage_desc">Mais utilizados</option>
              <option value="usage_asc">Menos utilizados</option>
            </select>
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
              {sortedServices.map((service) => {
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

                {/* BLOCO DE EDIÇÃO */}
                <div className="mb-4">
                  {isEditing ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-400">
                          Nome do serviço
                        </label>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          placeholder="Corte masculino, Barba, etc."
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] text-slate-400">
                          Categoria
                        </label>
                        <select
                          value={editCategoryExisting}
                          onChange={(e) =>
                            setEditCategoryExisting(e.target.value)
                          }
                          className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="">Sem categoria</option>
                          {categories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                        <input
                          value={editNewCategory}
                          onChange={(e) => setEditNewCategory(e.target.value)}
                          placeholder="Ou nova categoria..."
                          className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
                          value={editDuration}
                          onChange={(e) => setEditDuration(e.target.value)}
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
                            value={editBasePrice}
                            onChange={(e) => setEditBasePrice(e.target.value)}
                            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => void handleUpdateService()}
                            disabled={isUpdating}
                            className={[
                              "whitespace-nowrap rounded-lg px-4 py-2 text-[11px] font-semibold transition-colors",
                              isUpdating
                                ? "cursor-not-allowed border border-slate-700 bg-slate-800/60 text-slate-400"
                                : "border border-emerald-600 bg-emerald-600/80 text-emerald-50 hover:bg-emerald-500",
                            ].join(" ")}
                          >
                            {isUpdating ? "Salvando..." : "Salvar alterações"}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsEditing(false)}
                          className="mt-2 text-[11px] text-slate-400 hover:underline"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        // ao entrar em modo edição, preenche com o valor atual
                        setIsEditing(true);
                        setEditName(selectedService.name);
                        setEditDuration(
                          String(selectedService.durationMinutes)
                        );
                        setEditBasePrice(selectedService.basePrice.toFixed(2));
                        setEditCategoryExisting(selectedService.category ?? "");
                        setEditNewCategory("");
                      }}
                      className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-emerald-500 hover:text-emerald-300"
                    >
                      Editar serviço
                    </button>
                  )}
                </div>

                {/* GRID DOS 3 CARDS */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {/* Card de estado com toggle */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">Estado</p>
                    <p className="mt-1 text-sm font-semibold">
                      {selectedService.isActive ? "Ativo" : "Inativo"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Aqui podes ativar ou desativar o serviço sem perder o
                      histórico.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleToggleActive(selectedService)}
                      disabled={isTogglingActive}
                      className={[
                        "mt-3 inline-flex items-center justify-center rounded-lg px-3 py-1 text-[11px] font-semibold transition-colors",
                        selectedService.isActive
                          ? "border border-amber-500/70 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                          : "border border-emerald-500/70 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
                        isTogglingActive ? "cursor-not-allowed opacity-70" : "",
                      ].join(" ")}
                    >
                      {isTogglingActive
                        ? "Atualizando..."
                        : selectedService.isActive
                        ? "Desativar serviço"
                        : "Ativar serviço"}
                    </button>
                  </div>

                  {/* Card elegível para planos */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Pertence a algum plano?
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      {isLoadingPlanUsage
                        ? "Verificando..."
                        : planUsage && planUsage.totalPlans > 0
                        ? `Está em ${planUsage.totalPlans} plano(s)`
                        : "Não está em nenhum plano"}
                    </p>

                    <p className="mt-1 text-[11px] text-slate-500">
                      {planUsage && planUsage.totalPlans > 0 ? (
                        <>
                          Planos:{" "}
                          {planUsage.plans.map((p) => p.name).join(", ")} <br />
                          Gestão detalhada na tela de planos.
                        </>
                      ) : (
                        <>
                          Para incluir este serviço em algum plano, edita os
                          templates na tela de planos. Aqui mostramos apenas em
                          quais planos ele já está.
                        </>
                      )}
                    </p>
                  </div>

                  {/* Card notas internas */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Notas internas do serviço
                    </p>

                    {isEditingNotes ? (
                      <>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={3}
                          placeholder="Observações internas: regras especiais, materiais, restrições, etc."
                          className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />

                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-[10px] text-slate-500">
                            Campo de observação só para o proprietário/admin.
                            Não aparece para o cliente.
                          </p>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                // descarta alterações e volta pro valor original
                                setNotes(selectedService?.notes ?? "");
                                setIsEditingNotes(false);
                              }}
                              className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1 text-[11px] text-slate-300 hover:border-slate-500"
                            >
                              Cancelar
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleSaveNotes()}
                              disabled={isSavingNotes}
                              className={[
                                "rounded-lg px-3 py-1 text-[11px] font-semibold transition-colors",
                                isSavingNotes
                                  ? "cursor-not-allowed border border-slate-700 bg-slate-800/60 text-slate-400"
                                  : "border border-emerald-600 bg-emerald-600/80 text-emerald-50 hover:bg-emerald-500",
                              ].join(" ")}
                            >
                              {isSavingNotes ? "Salvando..." : "Salvar notas"}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {selectedService?.notes ? (
                          <p className="mt-2 whitespace-pre-line text-[11px] text-slate-200">
                            {selectedService.notes}
                          </p>
                        ) : (
                          <p className="mt-2 text-[11px] text-slate-500">
                            Ainda não há notas para este serviço.
                          </p>
                        )}

                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-[10px] text-slate-500">
                            Campo de observação só para o proprietário/admin.
                            Não aparece para o cliente.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setNotes(selectedService?.notes ?? "");
                              setIsEditingNotes(true);
                            }}
                            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-500 hover:text-emerald-300"
                          >
                            Editar notas
                          </button>
                        </div>
                      </>
                    )}
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

              <button
                type="button"
                className="text-[11px] text-emerald-400 hover:underline"
                onClick={() => {
                  const params = new URLSearchParams();

                  // força abrir na aba certa
                  params.set("tab", "services");

                  // se tiver serviço selecionado, filtra nele
                  if (selectedService?.id) {
                    params.set("serviceId", selectedService.id);
                  }

                  // mantém a unidade se existir
                  if (locationId) {
                    params.set("locationId", locationId);
                  }

                  router.push(`/owner/relatorios?${params.toString()}`);
                }}
              >
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
