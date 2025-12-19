"use client";

import { useEffect, useState, FormEvent } from "react";
import {
  fetchOwnerLocations,
  type OwnerLocation,
  type LocationsPaginationMeta,
  updateOwnerLocationActive,
  updateOwnerLocationManager,
  createOwnerLocation,
  updateOwnerLocationBusinessHours,
  updateOwnerLocationDetails,
} from "../_api/owner-locations";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  fetchOwnerProfessionals,
  type OwnerProfessional,
} from "../_api/owner-professionals";

export default function OwnerUnidadesPage() {
  const [locations, setLocations] = useState<OwnerLocation[]>([]);
  const [meta, setMeta] = useState<LocationsPaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [creating, setCreating] = useState(false);
  const searchParams = useSearchParams();
  const focusLocationId = searchParams.get("locationId");
  const [highlightLocationId, setHighlightLocationId] = useState<string | null>(
    null
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  // --- profissionais para escolher o responsável ---
  const [professionals, setProfessionals] = useState<OwnerProfessional[]>([]);
  const [professionalsLoading, setProfessionalsLoading] = useState(false);

  // location que está com o responsável sendo editado
  const [editingManagerLocationId, setEditingManagerLocationId] = useState<
    string | null
  >(null);

  const [selectedManagerId, setSelectedManagerId] = useState<string | "none">(
    "none"
  );
  type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

  type DayForm = {
    enabled: boolean;
    intervals: { start: string; end: string }[]; // até 2 intervalos
  };

  type HoursForm = Record<DayKey, DayForm>;

  const [editingHoursLocationId, setEditingHoursLocationId] = useState<
    string | null
  >(null);
  const [hoursForm, setHoursForm] = useState<HoursForm | null>(null);

  const weekdayLabels: { key: DayKey; label: string }[] = [
    { key: "mon", label: "Segunda" },
    { key: "tue", label: "Terça" },
    { key: "wed", label: "Quarta" },
    { key: "thu", label: "Quinta" },
    { key: "fri", label: "Sexta" },
    { key: "sat", label: "Sábado" },
    { key: "sun", label: "Domingo" },
  ];

  function templateToForm(
    template?: Record<string, [string, string][]>
  ): HoursForm {
    const base: HoursForm = {
      // Segunda a sábado: aberto das 08:00 às 14:00 (manhã)
      // e das 14:00 às 20:00 (tarde)
      mon: {
        enabled: true,
        intervals: [
          { start: "08:00", end: "14:00" }, // Manhã
          { start: "14:00", end: "20:00" }, // Tarde
        ],
      },
      tue: {
        enabled: true,
        intervals: [
          { start: "08:00", end: "14:00" },
          { start: "14:00", end: "20:00" },
        ],
      },
      wed: {
        enabled: true,
        intervals: [
          { start: "08:00", end: "14:00" },
          { start: "14:00", end: "20:00" },
        ],
      },
      thu: {
        enabled: true,
        intervals: [
          { start: "08:00", end: "14:00" },
          { start: "14:00", end: "20:00" },
        ],
      },
      fri: {
        enabled: true,
        intervals: [
          { start: "08:00", end: "14:00" },
          { start: "14:00", end: "20:00" },
        ],
      },
      sat: {
        enabled: true,
        intervals: [
          { start: "08:00", end: "14:00" },
          { start: "14:00", end: "20:00" },
        ],
      },
      // Domingo fechado por padrão
      sun: {
        enabled: false,
        intervals: [
          { start: "08:00", end: "14:00" },
          { start: "14:00", end: "20:00" },
        ],
      },
    };

    if (!template) return base;

    (Object.keys(template) as DayKey[]).forEach((day) => {
      const intervals = template[day] ?? [];
      if (intervals.length === 0) return;

      base[day] = {
        enabled: true,
        intervals: intervals.slice(0, 2).map(([start, end]) => ({
          start,
          end,
        })),
      };
    });

    return base;
  }

  function formToTemplate(form: HoursForm): Record<string, [string, string][]> {
    const result: Record<string, [string, string][]> = {};

    (Object.keys(form) as DayKey[]).forEach((day) => {
      const dayForm = form[day];
      if (!dayForm.enabled) return;

      const validIntervals: [string, string][] = [];

      dayForm.intervals.forEach((interval) => {
        const start = interval.start.trim();
        const end = interval.end.trim();
        if (!start || !end) return;
        if (start === end) return;

        validIntervals.push([start, end]);
      });

      if (validIntervals.length > 0) {
        result[day] = validIntervals;
      }
    });

    return result;
  }
  // --- editar unidade (nome + endereço) ---
  const [editingDetailsLocationId, setEditingDetailsLocationId] = useState<
    string | null
  >(null);

  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");

  function handleStartEditDetails(location: OwnerLocation) {
    setEditingDetailsLocationId(location.id);
    setEditName(location.name ?? "");
    setEditAddress(location.address ?? "");
  }

  function handleCancelEditDetails() {
    setEditingDetailsLocationId(null);
    setEditName("");
    setEditAddress("");
  }

  async function handleSaveDetails(location: OwnerLocation) {
    try {
      setSavingId(location.id);
      setError(null);

      const name = editName.trim();
      const address = editAddress.trim();

      if (!name) {
        setError("Informe um nome para a unidade.");
        return;
      }

      const updated = await updateOwnerLocationDetails({
        id: location.id,
        name,
        address: address ? address : null,
      });

      setLocations((prev) =>
        prev.map((loc) => (loc.id === updated.id ? updated : loc))
      );

      setEditingDetailsLocationId(null);
      setEditName("");
      setEditAddress("");
    } catch (err) {
      console.error(err);
      setError("Não foi possível editar a unidade.");
    } finally {
      setSavingId(null);
    }
  }
  useEffect(() => {
    if (!focusLocationId) return;
    if (loading) return;
    if (!locations.length) return;

    const exists = locations.some((l) => l.id === focusLocationId);
    if (!exists) return;

    setHighlightLocationId(focusLocationId);

    // espera o DOM renderizar a tabela
    requestAnimationFrame(() => {
      const el = document.getElementById(`location-row-${focusLocationId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    // remove highlight depois de um tempo
    const t = setTimeout(() => setHighlightLocationId(null), 2500);
    return () => clearTimeout(t);
  }, [focusLocationId, loading, locations]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const result = await fetchOwnerLocations({
          page: 1,
          pageSize: 20,
        });

        if (!cancelled) {
          setLocations(result.data);
          setMeta(result.meta);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error(err);
          setError("Não foi possível carregar as unidades.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    async function loadProfessionals() {
      try {
        setProfessionalsLoading(true);
        const list = await fetchOwnerProfessionals();
        if (!cancelled) {
          setProfessionals(list);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) {
          setProfessionalsLoading(false);
        }
      }
    }

    load();
    loadProfessionals();

    return () => {
      cancelled = true;
    };
  }, []);

  // --- criar unidade ---

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const name = newName.trim();
    const address = newAddress.trim();

    if (!name) {
      setError("Informe um nome para a unidade.");
      return;
    }

    try {
      setCreating(true);

      const created = await createOwnerLocation({
        name,
        address: address || undefined,
      });

      setLocations((prev) => [created, ...prev]);
      setMeta((prev) =>
        prev
          ? {
              ...prev,
              total: (prev.total ?? 0) + 1,
            }
          : prev
      );

      setNewName("");
      setNewAddress("");
      setIsCreating(false);
    } catch (err) {
      console.error(err);
      setError("Não foi possível criar a unidade.");
    } finally {
      setCreating(false);
    }
  }

  // --- ativar / desativar unidade ---

  async function handleToggleActive(location: OwnerLocation) {
    try {
      setSavingId(location.id);
      setError(null);

      const updated = await updateOwnerLocationActive({
        id: location.id,
        active: !location.active,
      });

      setLocations((prev) =>
        prev.map((loc) => (loc.id === updated.id ? updated : loc))
      );
    } catch (err) {
      console.error(err);
      setError("Não foi possível atualizar o status da unidade.");
    } finally {
      setSavingId(null);
    }
  }

  // --- responsável da unidade ---

  function handleStartEditManager(location: OwnerLocation) {
    setEditingManagerLocationId(location.id);
    setSelectedManagerId(location.managerProviderId ?? "none");
  }

  function handleCancelEditManager() {
    setEditingManagerLocationId(null);
    setSelectedManagerId("none");
  }
  // ---------------- handlers de horário padrão ----------------

  function handleStartEditHours(location: OwnerLocation) {
    setEditingHoursLocationId(location.id);

    // businessHoursTemplate já é Record<string, [string, string][]> | null | undefined
    // então fazemos o fallback pra undefined e mandamos direto pra templateToForm
    const template = location.businessHoursTemplate ?? undefined;

    setHoursForm(templateToForm(template));
  }

  function handleCancelEditHours() {
    setEditingHoursLocationId(null);
    setHoursForm(null);
  }

  function handleChangeDayEnabled(day: DayKey, enabled: boolean) {
    setHoursForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [day]: { ...prev[day], enabled },
      };
    });
  }

  function handleChangeIntervalTime(
    day: DayKey,
    index: number,
    field: "start" | "end",
    value: string
  ) {
    setHoursForm((prev) => {
      if (!prev) return prev;
      const dayForm = prev[day];
      const intervals = [...dayForm.intervals];
      if (!intervals[index]) {
        intervals[index] = { start: "09:00", end: "18:00" };
      }
      intervals[index] = { ...intervals[index], [field]: value };
      return {
        ...prev,
        [day]: { ...dayForm, intervals },
      };
    });
  }

  async function handleSaveHours(location: OwnerLocation) {
    if (!hoursForm) return;

    try {
      setSavingId(location.id);
      setError(null);

      const template = formToTemplate(hoursForm);

      const updated = await updateOwnerLocationBusinessHours({
        id: location.id,
        businessHoursTemplate: template,
      });

      setLocations((prev) =>
        prev.map((loc) => (loc.id === updated.id ? updated : loc))
      );
      setEditingHoursLocationId(null);
      setHoursForm(null);
    } catch (err) {
      console.error(err);
      setError("Não foi possível salvar o horário da unidade.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleSaveManager(location: OwnerLocation) {
    try {
      setSavingId(location.id);
      setError(null);

      const managerProviderId =
        selectedManagerId === "none" ? null : selectedManagerId;

      const updated = await updateOwnerLocationManager({
        id: location.id,
        managerProviderId,
      });

      setLocations((prev) =>
        prev.map((loc) => (loc.id === updated.id ? updated : loc))
      );
      setEditingManagerLocationId(null);
    } catch (err) {
      console.error(err);
      setError("Não foi possível atualizar o responsável da unidade.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Unidades</h1>
          <p className="mt-1 text-sm text-slate-400">
            Gerencie as filiais do seu negócio (nome, endereço e horários
            padrão).
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreating((v) => !v)}
          className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/15"
        >
          {isCreating ? "Cancelar" : "Nova unidade"}
        </button>
      </div>

      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-4 space-y-3 text-sm"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Nome da unidade
              </label>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-500"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Demo Barber - Centro"
              />
            </div>

            <div className="w-full sm:w-96">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Endereço (opcional)
              </label>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-500"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Ex.: Rua Central, 123 — Barcelos"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Ajuda em relatórios, unidade correta e organização interna.
              </p>
            </div>

            <div className="pt-5 sm:pt-0 flex items-center gap-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {creating ? "Salvando..." : "Salvar unidade"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Estado de erro */}
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Estado de loading */}
      {loading && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-400">
          Carregando unidades...
        </div>
      )}

      {/* Lista vazia */}
      {!loading && !error && locations.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-400">
          Nenhuma unidade cadastrada ainda. Em breve vamos permitir criar e
          configurar horários padrão por aqui.
        </div>
      )}

      {/* Tabela */}
      {!loading && !error && locations.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-100">
              {meta?.total ?? locations.length}{" "}
              {locations.length === 1 ? "unidade" : "unidades"} cadastrada
              {locations.length === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-slate-400">
              Se você tiver alguma duvida entre em contato com nosso suporte
              24hrs.
            </p>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Nome</th>
                <th className="px-4 py-3 text-left">Endereço</th>
                <th className="px-4 py-3 text-left">Horário padrão</th>
                <th className="px-4 py-3 text-left">Responsável</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Ações</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((location) => {
                const hasTemplate =
                  location.businessHoursTemplate &&
                  Object.keys(location.businessHoursTemplate).length > 0;

                const isSaving = savingId === location.id;
                const isEditingDetails =
                  editingDetailsLocationId === location.id;
                const isEditingManager =
                  editingManagerLocationId === location.id;

                return (
                  <tr
                    id={`location-row-${location.id}`}
                    key={location.id}
                    className={[
                      "border-b border-slate-800/60 last:border-b-0 hover:bg-slate-900/60",
                      highlightLocationId === location.id
                        ? "bg-emerald-500/10 ring-1 ring-emerald-500/30"
                        : "",
                    ].join(" ")}
                  >
                    {/* Nome */}
                    <td className="px-4 py-3 align-top text-slate-100">
                      <div className="font-medium">{location.name}</div>
                    </td>

                    <td className="px-4 py-3 align-top text-slate-300 text-xs">
                      {location.address ?? "—"}
                    </td>

                    {/* Horário padrão */}
                    <td className="px-4 py-3 align-top text-slate-300 text-xs">
                      <div className="flex flex-col gap-2">
                        {hasTemplate ? (
                          <span className="inline-flex items-center justify-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 border border-emerald-500/30">
                            Horario configurado
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 border border-slate-700">
                            Horario padrão do sistema
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleStartEditHours(location)}
                          className="inline-flex items-center justify-center rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
                        >
                          {hasTemplate
                            ? "Editar horário"
                            : "Configurar horário"}
                        </button>
                      </div>
                    </td>

                    {/* Responsável */}
                    <td className="px-4 py-3 align-top text-xs text-slate-300">
                      {location.managerProviderName ?? "—"}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 align-top text-xs">
                      {location.active ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 border border-emerald-500/30">
                          Ativa
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 border border-slate-700">
                          Inativa
                        </span>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3 align-top text-xs">
                      <div className="flex flex-col gap-2">
                        <Link
                          href={`/owner/relatorios?tab=unidade&locationId=${location.id}`}
                          className="inline-flex items-center justify-center rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
                        >
                          Ver relatórios da unidade
                        </Link>

                        {isEditingDetails ? (
                          <>
                            <div className="flex flex-col gap-2">
                              <input
                                className="w-full rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="Nome da unidade"
                                disabled={isSaving}
                              />

                              <input
                                className="w-full rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
                                value={editAddress}
                                onChange={(e) => setEditAddress(e.target.value)}
                                placeholder="Endereço (opcional)"
                                disabled={isSaving}
                              />
                            </div>

                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleSaveDetails(location)}
                                className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                {isSaving ? "Salvando..." : "Salvar"}
                              </button>

                              <button
                                type="button"
                                onClick={handleCancelEditDetails}
                                className="inline-flex items-center justify-center rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                              >
                                Cancelar
                              </button>
                            </div>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleStartEditDetails(location)}
                            className="inline-flex items-center justify-center rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            Editar unidade
                          </button>
                        )}
                        {isEditingManager ? (
                          <>
                            <div className="flex flex-col gap-2">
                              <select
                                className="w-full rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
                                value={selectedManagerId}
                                onChange={(e) =>
                                  setSelectedManagerId(
                                    (e.target.value || "none") as
                                      | string
                                      | "none"
                                  )
                                }
                                disabled={professionalsLoading || isSaving}
                              >
                                <option value="none">Nenhum responsável</option>
                                {professionals.map((prof) => (
                                  <option key={prof.id} value={prof.id}>
                                    {prof.name}{" "}
                                    {prof.locationName
                                      ? `· ${prof.locationName}`
                                      : ""}
                                  </option>
                                ))}
                              </select>

                              {professionalsLoading && (
                                <span className="text-[11px] text-slate-400">
                                  Carregando profissionais...
                                </span>
                              )}
                            </div>

                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleSaveManager(location)}
                                className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                {isSaving ? "Salvando..." : "Salvar"}
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEditManager}
                                className="inline-flex items-center justify-center rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                              >
                                Cancelar
                              </button>
                            </div>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleStartEditManager(location)}
                            className="inline-flex items-center justify-center rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {location.managerProviderName
                              ? "Alterar responsável"
                              : "Definir responsável"}
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleToggleActive(location)}
                          className="inline-flex items-center justify-center rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {location.active
                            ? "Desativar unidade"
                            : "Ativar unidade"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {editingHoursLocationId && hoursForm && (
            <div className="border-t border-slate-800 px-4 py-4 bg-slate-950/60">
              {(() => {
                const location = locations.find(
                  (l) => l.id === editingHoursLocationId
                );
                if (!location) return null;

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-100">
                          Horário padrão – {location.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          Defina os horários de funcionamento por dia da semana.
                          Deixe o dia como &quot;Fechado&quot; se não atender.
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveHours(location)}
                          disabled={savingId === location.id}
                          className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                        >
                          {savingId === location.id
                            ? "Salvando..."
                            : "Salvar horário"}
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEditHours}
                          className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-200 hover:border-slate-500"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {weekdayLabels.map(({ key, label }) => {
                        const dayForm = hoursForm[key];

                        return (
                          <div
                            key={key}
                            className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-slate-100">
                                {label}
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  handleChangeDayEnabled(key, !dayForm.enabled)
                                }
                                className="text-[11px] rounded-full px-2 py-0.5 border border-slate-700 text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
                              >
                                {dayForm.enabled ? "Aberto" : "Fechado"}
                              </button>
                            </div>

                            {dayForm.enabled && (
                              <div className="space-y-3 text-[11px] text-slate-200">
                                {/* Manhã */}
                                <div className="space-y-1">
                                  <span className="text-[11px] font-medium text-slate-300">
                                    Manhã
                                  </span>

                                  <div className="flex items-center gap-2">
                                    <span className="w-8">De</span>
                                    <input
                                      type="time"
                                      value={dayForm.intervals[0]?.start ?? ""}
                                      onChange={(e) =>
                                        handleChangeIntervalTime(
                                          key,
                                          0,
                                          "start",
                                          e.target.value
                                        )
                                      }
                                      className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
                                    />
                                    <span className="w-4 text-center">até</span>
                                    <input
                                      type="time"
                                      value={dayForm.intervals[0]?.end ?? ""}
                                      onChange={(e) =>
                                        handleChangeIntervalTime(
                                          key,
                                          0,
                                          "end",
                                          e.target.value
                                        )
                                      }
                                      className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
                                    />
                                  </div>
                                </div>

                                {/* Tarde (segundo intervalo opcional) */}
                                <div className="space-y-1">
                                  <span className="text-[11px] font-medium text-slate-300">
                                    Tarde
                                  </span>

                                  <div className="flex items-center gap-2">
                                    <span className="w-8">De</span>
                                    <input
                                      type="time"
                                      value={dayForm.intervals[1]?.start ?? ""}
                                      onChange={(e) =>
                                        handleChangeIntervalTime(
                                          key,
                                          1,
                                          "start",
                                          e.target.value
                                        )
                                      }
                                      className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
                                      placeholder="14:00"
                                    />
                                    <span className="w-4 text-center">até</span>
                                    <input
                                      type="time"
                                      value={dayForm.intervals[1]?.end ?? ""}
                                      onChange={(e) =>
                                        handleChangeIntervalTime(
                                          key,
                                          1,
                                          "end",
                                          e.target.value
                                        )
                                      }
                                      className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
                                      placeholder="18:00"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
