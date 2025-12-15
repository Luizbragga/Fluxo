"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  fetchOwnerProfessionals,
  fetchOwnerProviderEarnings,
  fetchOwnerProviderCommissions,
  fetchOwnerProviderPayouts,
  upsertOwnerProviderCommission,
  createOwnerProfessional,
  updateOwnerProfessional,
  type OwnerProfessional,
  type OwnerProviderEarningsItem,
  type OwnerProviderCommission,
  type OwnerProviderPayout,
} from "../_api/owner-professionals";
import {
  fetchOwnerLocations,
  type OwnerLocation,
} from "../_api/owner-services";
import { useRouter, useSearchParams } from "next/navigation";

// ---- Tipos auxiliares ------------------------------------------------------

type SpecialtyLiteral =
  | "barber"
  | "hairdresser"
  | "nail"
  | "esthetic"
  | "makeup"
  | "tattoo"
  | "other";

const SPECIALTY_OPTIONS: { value: SpecialtyLiteral; label: string }[] = [
  { value: "barber", label: "Barber" },
  { value: "hairdresser", label: "Cabeleireiro(a)" },
  { value: "nail", label: "Unhas" },
  { value: "esthetic", label: "Estética" },
  { value: "makeup", label: "Maquilhagem" },
  { value: "tattoo", label: "Tatuagem" },
  { value: "other", label: "Outra" },
];

type ProfessionalSummary = {
  id: string;
  totalAppointmentsMonth: number;
  totalRevenueCents: number;
  professionalShareCents: number;
  spaceShareCents: number;
};

type PeriodFilter = "day" | "week" | "month";
const eurNumber = new Intl.NumberFormat("pt-PT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatEURFromCents(cents: number) {
  return `€ ${eurNumber.format(cents / 100)}`;
}

export default function OwnerProfessionalsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locationIdFromUrl = searchParams.get("locationId");
  const openCreateFromUrl = searchParams.get("openCreate") === "1";
  const returnToFromUrl = searchParams.get("returnTo");
  const [didAutoOpenCreate, setDidAutoOpenCreate] = useState(false);

  const [period, setPeriod] = useState<PeriodFilter>("month");
  // lista + seleção
  const [professionals, setProfessionals] = useState<OwnerProfessional[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // estado de carregamento/erro geral
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // earnings agregados
  const [providerEarnings, setProviderEarnings] = useState<
    OwnerProviderEarningsItem[]
  >([]);

  // comissões e repasses
  const [commissions, setCommissions] = useState<OwnerProviderCommission[]>([]);
  const [isCommissionEditorOpen, setIsCommissionEditorOpen] = useState(false);
  const [commissionPercentageInput, setCommissionPercentageInput] =
    useState<string>("50");

  const [payouts, setPayouts] = useState<OwnerProviderPayout[]>([]);
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [payoutsError, setPayoutsError] = useState<string | null>(null);

  // unidades (locations)
  const [locations, setLocations] = useState<OwnerLocation[]>([]);

  // modal de criação de profissional
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createLocationId, setCreateLocationId] = useState<string>("");
  const [createSpecialty, setCreateSpecialty] =
    useState<SpecialtyLiteral>("barber");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // modal de edição de profissional
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editLocationId, setEditLocationId] = useState<string>("");
  const [editSpecialty, setEditSpecialty] =
    useState<SpecialtyLiteral>("barber");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // ---------------------------------------------------------------------------
  // Carga inicial (profissionais + earnings + locations)
  // ---------------------------------------------------------------------------
  function getRangeForPeriod(period: PeriodFilter): {
    from: string;
    to: string;
  } {
    const now = new Date();

    // Trabalhar sempre em UTC pra bater com o backend
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();

    if (period === "day") {
      const fromDate = new Date(Date.UTC(year, month, day, 0, 0, 0));
      const toDate = new Date(Date.UTC(year, month, day + 1, 0, 0, 0));
      return { from: fromDate.toISOString(), to: toDate.toISOString() };
    }

    if (period === "week") {
      // aqui vou assumir "últimos 7 dias" (hoje incluído)
      const toDate = new Date(Date.UTC(year, month, day + 1, 0, 0, 0)); // amanhã 00:00
      const fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from: fromDate.toISOString(), to: toDate.toISOString() };
    }

    // "month" -> mês atual
    const fromDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    const toDate = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
    return { from: fromDate.toISOString(), to: toDate.toISOString() };
  }

  async function loadAll(selectId?: string, periodOverride?: PeriodFilter) {
    try {
      setLoading(true);

      const effectivePeriod = periodOverride ?? period;
      const { from, to } = getRangeForPeriod(effectivePeriod);

      const [professionalsData, earningsData, locationsData] =
        await Promise.all([
          fetchOwnerProfessionals(),
          fetchOwnerProviderEarnings({ from, to }),
          fetchOwnerLocations(),
        ]);

      // 1) descobrir o maior nº de atendimentos entre todos os providers
      const maxAppointments = earningsData.reduce(
        (max, item) =>
          item.appointmentsCount > max ? item.appointmentsCount : max,
        0
      );

      // 2) calcular a ocupação REAL (0–100) para cada profissional
      // (vem do backend: occupationPercentage)
      const professionalsWithOccupation = professionalsData.map((pro) => {
        const providerEarning = earningsData.find(
          (e) => e.providerId === pro.id
        );

        return {
          ...pro,
          averageOccupation: providerEarning?.occupationPercentage ?? 0,
        };
      });

      setProfessionals(professionalsWithOccupation);
      setProviderEarnings(earningsData);
      setLocations(locationsData);

      if (professionalsWithOccupation.length === 0) {
        setSelectedId(null);
      } else if (selectId) {
        setSelectedId(selectId);
      } else {
        setSelectedId(professionalsWithOccupation[0].id);
      }
      setError(null);
    } catch (err: any) {
      console.error("Erro ao carregar profissionais/earnings/locations:", err);
      setError(
        err?.message ?? "Erro ao carregar profissionais. Tente novamente."
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadAll(undefined, period);
  }, [period]);

  useEffect(() => {
    if (didAutoOpenCreate) return;
    if (!openCreateFromUrl) return;

    // se veio locationId, tenta usar ele (mesmo que locations ainda esteja carregando)
    openCreateModal(locationIdFromUrl ?? undefined);
    setDidAutoOpenCreate(true);
  }, [didAutoOpenCreate, openCreateFromUrl, locationIdFromUrl]);

  // ---------------------------------------------------------------------------
  // Carrega comissões + repasses quando muda o selecionado
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!selectedId) {
      setCommissions([]);
      setPayouts([]);
      setPayoutsError(null);
      setPayoutsLoading(false);
      return;
    }

    async function loadCommissionsAndPayouts() {
      setPayoutsLoading(true);

      try {
        const [commissionsData, payoutsData] = await Promise.all([
          fetchOwnerProviderCommissions(selectedId),
          fetchOwnerProviderPayouts(selectedId),
        ]);

        setCommissions(commissionsData);
        setPayouts(payoutsData);
        setPayoutsError(null);
      } catch (err: any) {
        console.error("Erro ao carregar comissões/repasses do provider:", err);
        setPayouts([]);
        setPayoutsError(
          err?.message ?? "Erro ao carregar repasses. Tente novamente."
        );
      } finally {
        setPayoutsLoading(false);
      }
    }

    loadCommissionsAndPayouts();
  }, [selectedId]);

  // ---------------------------------------------------------------------------
  // Derivados
  // ---------------------------------------------------------------------------

  const selectedProfessional =
    professionals.find((p) => p.id === selectedId) ?? null;

  const selectedEarnings =
    selectedProfessional &&
    providerEarnings.find((e) => e.providerId === selectedProfessional.id);

  const selectedSummary: ProfessionalSummary | null = selectedProfessional
    ? selectedEarnings
      ? {
          id: selectedProfessional.id,
          totalAppointmentsMonth: selectedEarnings.appointmentsCount,
          totalRevenueCents: selectedEarnings.servicePriceCents,
          professionalShareCents: selectedEarnings.providerEarningsCents,
          spaceShareCents: selectedEarnings.houseEarningsCents,
        }
      : {
          // sem earnings ainda -> tudo zerado
          id: selectedProfessional.id,
          totalAppointmentsMonth: 0,
          totalRevenueCents: 0,
          professionalShareCents: 0,
          spaceShareCents: 0,
        }
    : null;

  const selectedOccupation = selectedEarnings?.occupationPercentage ?? 0;

  // ---------------------------------------------------------------------------
  // Comissão
  // ---------------------------------------------------------------------------

  function handleOpenCommissionEditor() {
    if (!selectedProfessional) return;

    const defaultCommission = commissions.find((c) => !c.service);

    if (defaultCommission) {
      setCommissionPercentageInput(String(defaultCommission.percentage));
    } else {
      setCommissionPercentageInput("50");
    }

    setIsCommissionEditorOpen(true);
  }

  async function handleSaveCommission() {
    if (!selectedProfessional) return;

    const percentage = Number(commissionPercentageInput);

    if (Number.isNaN(percentage) || percentage < 0 || percentage > 100) {
      alert("Percentual deve ser um número entre 0 e 100.");
      return;
    }

    try {
      await upsertOwnerProviderCommission(selectedProfessional.id, {
        serviceId: null, // regra padrão (todos os serviços)
        percentage,
        active: true,
      });

      const data = await fetchOwnerProviderCommissions(selectedProfessional.id);
      setCommissions(data);

      setIsCommissionEditorOpen(false);
    } catch (err) {
      console.error("Erro ao guardar comissão:", err);
      alert("Erro ao guardar regra de comissão. Tente novamente.");
    }
  }

  // ---------------------------------------------------------------------------
  // Criação de profissional
  // ---------------------------------------------------------------------------

  function openCreateModal(forcedLocationId?: string) {
    setCreateName("");
    setCreateEmail("");
    setCreatePhone("");
    setCreateSpecialty("barber");

    if (forcedLocationId) {
      setCreateLocationId(forcedLocationId);
    } else if (selectedProfessional?.locationId) {
      setCreateLocationId(selectedProfessional.locationId);
    } else if (locations[0]) {
      setCreateLocationId(locations[0].id);
    } else {
      setCreateLocationId("");
    }

    setCreateError(null);
    setIsCreateOpen(true);
  }

  function closeCreateModal() {
    setIsCreateOpen(false);
  }

  async function handleCreateProfessional(e: FormEvent) {
    e.preventDefault();
    if (createLoading) return;

    if (!createName.trim()) {
      setCreateError("Nome do profissional é obrigatório.");
      return;
    }
    if (!createEmail.trim()) {
      setCreateError("Email é obrigatório (para login e convite).");
      return;
    }
    if (!createPhone.trim()) {
      setCreateError("Telefone é obrigatório.");
      return;
    }
    if (!createLocationId) {
      setCreateError("Selecione uma unidade.");
      return;
    }

    try {
      setCreateLoading(true);
      setCreateError(null);

      const newProfessional = await createOwnerProfessional({
        name: createName.trim(),
        email: createEmail.trim(),
        phone: createPhone.trim(),
        locationId: createLocationId,
        specialty: createSpecialty,
      });

      // recarrega lista e já seleciona o novo
      await loadAll(newProfessional.id);
      closeCreateModal();
      if (returnToFromUrl) {
        router.push(returnToFromUrl);
      }
    } catch (err: any) {
      console.error("Erro ao criar profissional:", err);
      setCreateError(
        err?.message ?? "Erro ao criar profissional. Tente novamente."
      );
    } finally {
      setCreateLoading(false);
    }
  }
  function openEditModal() {
    if (!selectedProfessional) return;

    setEditName(selectedProfessional.name ?? "");
    setEditEmail(selectedProfessional.email ?? "");
    setEditPhone(selectedProfessional.phone ?? "");
    setEditLocationId(selectedProfessional.locationId ?? "");
    setEditSpecialty(
      (selectedProfessional.specialty as SpecialtyLiteral) ?? "barber"
    );

    setEditError(null);
    setIsEditOpen(true);
  }

  function closeEditModal() {
    setIsEditOpen(false);
  }

  async function handleSaveEditProfessional(e: FormEvent) {
    e.preventDefault();
    if (!selectedProfessional) return;
    if (editLoading) return;

    if (!editName.trim()) {
      setEditError("Nome do profissional é obrigatório.");
      return;
    }
    if (!editEmail.trim()) {
      setEditError("Email é obrigatório.");
      return;
    }
    if (!editPhone.trim()) {
      setEditError("Telefone é obrigatório.");
      return;
    }
    if (!editLocationId) {
      setEditError("Selecione uma unidade.");
      return;
    }

    try {
      setEditLoading(true);
      setEditError(null);

      await updateOwnerProfessional(selectedProfessional.id, {
        name: editName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        locationId: editLocationId,
        specialty: editSpecialty,
      });

      await loadAll(selectedProfessional.id);
      closeEditModal();
    } catch (err: any) {
      console.error("Erro ao editar profissional:", err);
      setEditError(
        err?.message ?? "Erro ao editar profissional. Tente novamente."
      );
    } finally {
      setEditLoading(false);
    }
  }
  // ---------------------------------------------------------------------------

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
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/80 p-[2px]">
            {(["day", "week", "month"] as PeriodFilter[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={[
                  "px-2 py-1 rounded-md text-[11px]",
                  period === p
                    ? "bg-slate-800 text-slate-100"
                    : "text-slate-400 hover:text-slate-100",
                ].join(" ")}
              >
                {p === "day" ? "Dia" : p === "week" ? "Semana" : "Mês"}
              </button>
            ))}
          </div>

          <select className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200">
            <option>Unidade atual do tenant</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <select className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200">
            <option>Unidade atual do tenant</option>
          </select>
          <button
            className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200 hover:bg-emerald-600/30"
            type="button"
            onClick={openCreateModal}
          >
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
            <button
              type="button"
              className="text-[11px] text-emerald-400 hover:underline"
              onClick={() => router.push("/owner/relatorios?view=occupation")}
            >
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

                const proEarnings = providerEarnings.find(
                  (e) => e.providerId === pro.id
                );
                const occupation = proEarnings?.occupationPercentage ?? 0;

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
                        <p className="text-sm font-semibold">{occupation}%</p>

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
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[11px] text-slate-200 hover:border-slate-500"
                      onClick={openEditModal}
                    >
                      Editar profissional
                    </button>

                    <div className="text-right text-xs">
                      <p className="text-slate-400">Ocupação média</p>
                      <p className="text-lg font-semibold">
                        {selectedOccupation}%
                      </p>
                    </div>
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
                      {formatEURFromCents(selectedSummary.totalRevenueCents)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Parte do profissional
                    </p>
                    <p className="mt-1 text-lg font-semibold text-emerald-300">
                      {formatEURFromCents(
                        selectedSummary.professionalShareCents
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Parte do espaço
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {formatEURFromCents(selectedSummary.spaceShareCents)}
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
            {/* Repasses recentes */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400">Repasses recentes</p>
                <button
                  type="button"
                  className="text-[11px] text-emerald-400 hover:underline"
                  onClick={() => router.push("/owner/relatorios?view=payouts")}
                >
                  Ver todos
                </button>
              </div>

              {!selectedProfessional ? (
                <p className="text-[11px] text-slate-400">
                  Selecione um profissional para ver os repasses.
                </p>
              ) : payoutsLoading ? (
                <p className="text-[11px] text-slate-400">
                  Carregando repasses…
                </p>
              ) : payoutsError ? (
                <p className="text-[11px] text-rose-400">{payoutsError}</p>
              ) : payouts.length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  Ainda não há repasses registados para{" "}
                  <span className="font-medium text-slate-200">
                    {selectedProfessional.name}
                  </span>
                  .
                </p>
              ) : (
                <div className="space-y-2">
                  {payouts.map((payout) => (
                    <div
                      key={payout.id}
                      className={[
                        "rounded-xl border px-3 py-2 flex items-center justify-between",
                        payout.status === "pending"
                          ? "border-amber-500/40 bg-amber-500/10"
                          : "border-slate-800 bg-slate-950/60 opacity-80",
                      ].join(" ")}
                    >
                      <div>
                        <p className="text-[11px] text-slate-300">
                          {payout.periodLabel}
                        </p>
                        <p className="text-sm font-semibold">
                          € {payout.amount}
                        </p>
                      </div>
                      <span
                        className={[
                          "text-[10px] px-2 py-[1px] rounded-full",
                          payout.status === "pending"
                            ? "bg-amber-500/30 text-amber-100"
                            : "bg-emerald-500/20 text-emerald-100",
                        ].join(" ")}
                      >
                        {payout.status === "pending" ? "Pendente" : "Pago"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Regras de comissão */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400">Regras de comissão</p>
                <button
                  className="text-[11px] text-emerald-400 hover:underline disabled:opacity-40"
                  onClick={handleOpenCommissionEditor}
                  disabled={!selectedProfessional}
                >
                  Gerir comissão
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
                    .
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

                {isCommissionEditorOpen && selectedProfessional && (
                  <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/90 p-3 space-y-2">
                    <p className="text-[11px] text-slate-300">
                      Editar comissão padrão de{" "}
                      <span className="font-semibold">
                        {selectedProfessional.name}
                      </span>
                      .
                    </p>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <label className="flex items-center gap-2">
                        <span>Percentual (%)</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={commissionPercentageInput}
                          onChange={(e) =>
                            setCommissionPercentageInput(e.target.value)
                          }
                          className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </label>
                    </div>

                    <div className="flex justify-end gap-2 text-[11px]">
                      <button
                        type="button"
                        className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                        onClick={() => setIsCommissionEditorOpen(false)}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-100 hover:bg-emerald-600/30"
                        onClick={handleSaveCommission}
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Modal de criação de profissional */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Adicionar profissional</h2>
              <button
                className="text-xs text-slate-400 hover:text-slate-200"
                type="button"
                onClick={closeCreateModal}
              >
                Fechar
              </button>
            </div>

            <form className="space-y-3" onSubmit={handleCreateProfessional}>
              <div className="space-y-1 text-xs">
                <label className="block text-slate-300">
                  Nome do profissional
                </label>
                <input
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="Ex.: Rafa Barber"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </div>

              <div className="space-y-1 text-xs">
                <label className="block text-slate-300">
                  Email (login do profissional)
                </label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="email@exemplo.com"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                />
                <p className="text-[10px] text-slate-500">
                  Vamos usar este email para o login e, no futuro, para enviar o
                  convite de acesso.
                </p>
              </div>

              <div className="space-y-1 text-xs">
                <label className="block text-slate-300">Telefone</label>
                <input
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="Telemóvel / WhatsApp"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                />
              </div>

              <div className="space-y-1 text-xs">
                <label className="block text-slate-300">Unidade</label>
                <select
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  value={createLocationId}
                  onChange={(e) => setCreateLocationId(e.target.value)}
                >
                  <option value="">Selecione uma unidade…</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 text-xs">
                <label className="block text-slate-300">Especialidade</label>
                <select
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  value={createSpecialty}
                  onChange={(e) =>
                    setCreateSpecialty(e.target.value as SpecialtyLiteral)
                  }
                >
                  {SPECIALTY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {createError && (
                <p className="text-[11px] text-rose-400">{createError}</p>
              )}

              <div className="mt-4 flex justify-end gap-2 text-[11px]">
                <button
                  type="button"
                  className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                  onClick={closeCreateModal}
                  disabled={createLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-100 hover:bg-emerald-600/30 disabled:opacity-60"
                  disabled={createLoading}
                >
                  {createLoading ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de edição de profissional */}
      {isEditOpen && selectedProfessional && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Editar profissional</h2>
              <button
                className="text-xs text-slate-400 hover:text-slate-200"
                type="button"
                onClick={closeEditModal}
              >
                Fechar
              </button>
            </div>

            <form className="space-y-3" onSubmit={handleSaveEditProfessional}>
              <div className="space-y-1 text-xs">
                <label className="block text-slate-300">
                  Nome do profissional
                </label>
                <input
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              <div className="space-y-1 text-xs">
                <label className="block text-slate-300">Email</label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1 text-xs">
                <label className="block text-slate-300">Telefone</label>
                <input
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>

              <div className="space-y-1 text-xs">
                <label className="block text-slate-300">Unidade</label>
                <select
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  value={editLocationId}
                  onChange={(e) => setEditLocationId(e.target.value)}
                >
                  <option value="">Selecione uma unidade…</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 text-xs">
                <label className="block text-slate-300">Especialidade</label>
                <select
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  value={editSpecialty}
                  onChange={(e) =>
                    setEditSpecialty(e.target.value as SpecialtyLiteral)
                  }
                >
                  {SPECIALTY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {editError && (
                <p className="text-[11px] text-rose-400">{editError}</p>
              )}

              <div className="mt-4 flex justify-end gap-2 text-[11px]">
                <button
                  type="button"
                  className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                  onClick={closeEditModal}
                  disabled={editLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-100 hover:bg-emerald-600/30 disabled:opacity-60"
                  disabled={editLoading}
                >
                  {editLoading ? "Guardando…" : "Guardar alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
