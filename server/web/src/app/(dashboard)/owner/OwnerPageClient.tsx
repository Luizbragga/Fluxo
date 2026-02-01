// web/src/app/(dashboard)/owner/OwnerPageClient.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useRequireAuth } from "@/lib/use-auth";

import {
  fetchOwnerLocations,
  type OwnerLocation,
} from "./_api/owner-locations";

import {
  fetchOwnerOverview,
  type QuickFinancialCard,
} from "./_api/owner-overview";

import { fetchOwnerAgendaDay, type OwnerAgendaDay } from "./_api/owner-agenda";
import { fetchOwnerFinanceiroWithRange } from "./_api/owner-financeiro";

import {
  OverviewKpiCard,
  type OverviewKpi,
} from "./_components/overview-kpi-card";

import { ProfessionalPayoutRow } from "./_components/professional-payout-row";

// ----------------- Tipos -----------------

type OwnerOverview = Awaited<ReturnType<typeof fetchOwnerOverview>>;
type OwnerFinanceiroData = Awaited<
  ReturnType<typeof fetchOwnerFinanceiroWithRange>
>;

type SlotAppt = {
  id: string;
  time: string;
  serviceName: string;
  customerName: string;
  professionalId: string;
};

type Slot = {
  timeLabel: string;
  appts: SlotAppt[];
};

// ----------------- Consts -----------------

const weekdayNames = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

// ----------------- Slots (MESMO PADRÃO DA TELA AGENDA) -----------------

const DEFAULT_TIME_SLOTS = [
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
  "19:00",
  "19:30",
  "20:00",
];

type DayInterval = { start: string; end: string };

function timeStrToMinutes(time: string): number {
  const [hStr, mStr] = String(time ?? "").split(":");
  const h = Number(hStr) || 0;
  const m = Number(mStr) || 0;
  return h * 60 + m;
}

// tolerante: aceita keys em EN (mon) ou PT (seg), e template como string JSON ou objeto
function getWeekdayCandidateKeys(date: Date): string[] {
  // 0=dom, 1=seg...
  const map: string[][] = [
    ["sun", "dom", "domingo"],
    ["mon", "seg", "segunda"],
    ["tue", "ter", "terça", "terca"],
    ["wed", "qua", "quarta"],
    ["thu", "qui", "quinta"],
    ["fri", "sex", "sexta"],
    ["sat", "sab", "sábado", "sabado"],
  ];
  return map[date.getDay()] ?? [];
}

function tryParseTemplate(raw: any): any {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

function normalizeIntervals(raw: any): DayInterval[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((pair: any) => {
      if (!Array.isArray(pair) || pair.length < 2) return null;
      const start = String(pair[0] ?? "").trim();
      const end = String(pair[1] ?? "").trim();
      if (!start || !end) return null;
      return { start, end } as DayInterval;
    })
    .filter(Boolean) as DayInterval[];
}

function buildSlotsFromIntervals(
  intervals: DayInterval[],
  stepMin = 30,
): string[] {
  const out: string[] = [];

  for (const itv of intervals) {
    const startMin = timeStrToMinutes(itv.start);
    const endMin = timeStrToMinutes(itv.end);

    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) continue;
    if (endMin <= startMin) continue;

    for (let m = startMin; m <= endMin; m += stepMin) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      out.push(`${hh}:${mm}`);
    }
  }

  return Array.from(new Set(out)).sort();
}

function getLocationDayIntervals(location: any, date: Date): DayInterval[] {
  const templateRaw =
    location?.businessHoursTemplate ??
    location?.weekdayTemplate ??
    location?.hoursTemplate ??
    location?.scheduleTemplate ??
    location?.workingHoursTemplate ??
    null;

  const template = tryParseTemplate(templateRaw);
  if (!template) return [];

  const keys = getWeekdayCandidateKeys(date);

  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(template, k)) {
      return normalizeIntervals(template[k]);
    }
  }

  return [];
}

function buildSlotsForToday(params: {
  selectedLocationId: string;
  locations: any[];
  appointmentsByTime: Map<string, SlotAppt[]>;
}): { slots: Slot[]; scheduleOk: boolean } {
  const { selectedLocationId, locations, appointmentsByTime } = params;
  const today = new Date();

  // sem unidade => DEFAULT_TIME_SLOTS
  if (!selectedLocationId) {
    const slots: Slot[] = DEFAULT_TIME_SLOTS.map((timeLabel) => ({
      timeLabel,
      appts: appointmentsByTime.get(timeLabel) ?? [],
    }));
    return { slots, scheduleOk: true };
  }

  const loc =
    locations.find((l) => String(l.id) === String(selectedLocationId)) ?? null;
  if (!loc) return { slots: [], scheduleOk: false };

  const intervals = getLocationDayIntervals(loc, today);
  if (!intervals.length) return { slots: [], scheduleOk: false };

  const labels = buildSlotsFromIntervals(intervals, 30);

  return {
    slots: labels.map((timeLabel) => ({
      timeLabel,
      appts: appointmentsByTime.get(timeLabel) ?? [],
    })),
    scheduleOk: true,
  };
}

// ----- helper para sobrescrever o KPI de receita prevista/faturada -----
function overrideRevenueKpiWithFinance(
  kpis: OverviewKpi[],
  financeiro: OwnerFinanceiroData,
  agenda: OwnerAgendaDay,
): OverviewKpi[] {
  const previstoPlanos = financeiro.planPayments.reduce(
    (sum, p) => sum + p.amount,
    0,
  );

  const faturadoPlanos = financeiro.planPayments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);

  const avulsosValidos = agenda.appointments.filter(
    (a) =>
      a.billingType === "avulso" &&
      a.status !== "cancelled" &&
      a.status !== "no_show",
  );

  const previstoAvulsos =
    avulsosValidos.reduce((sum, a) => sum + (a.servicePriceCents ?? 0), 0) /
    100;

  const faturadoAvulsos =
    agenda.appointments
      .filter((a) => a.billingType === "avulso" && a.status === "done")
      .reduce((sum, a) => sum + (a.servicePriceCents ?? 0), 0) / 100;

  const previstoHoje = previstoAvulsos + previstoPlanos;
  const faturadoHoje = faturadoAvulsos + faturadoPlanos;

  return kpis.map((kpi) =>
    kpi.id === "expected_revenue_today"
      ? {
          ...kpi,
          value: `€ ${previstoHoje.toFixed(2).replace(".", ",")}`,
          helper: `Faturado hoje: € ${faturadoHoje
            .toFixed(2)
            .replace(".", ",")} · Previsto hoje: € ${previstoHoje
            .toFixed(2)
            .replace(".", ",")}`,
          tone: previstoHoje > 0 ? "positive" : "neutral",
        }
      : kpi,
  );
}

export default function OwnerPageClient() {
  const { user, loading: authLoading } = useRequireAuth({
    requiredRole: "owner",
  });

  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<OwnerOverview | null>(null);
  const [agendaDay, setAgendaDay] = useState<OwnerAgendaDay | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [locations, setLocations] = useState<OwnerLocation[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  const selectedLocationId = searchParams.get("locationId") ?? "";
  const [selectedProfessionalId, setSelectedProfessionalId] =
    useState<string>("all");

  const [expandedSlot, setExpandedSlot] = useState<{
    time: string;
    appts: SlotAppt[];
  } | null>(null);

  function openSlotDetails(time: string, appts: SlotAppt[]) {
    if (!appts || appts.length === 0) return;
    setExpandedSlot({ time, appts });
  }

  function closeSlotDetails() {
    setExpandedSlot(null);
  }

  function goToAgenda(mode: "daily" | "weekly") {
    const params = new URLSearchParams();
    if (selectedLocationId) params.set("locationId", selectedLocationId);
    params.set("view", mode);
    router.push(`/owner/agenda?${params.toString()}`);
  }

  // carrega unidades
  useEffect(() => {
    async function loadLocations() {
      try {
        const res = await fetchOwnerLocations({ page: 1, pageSize: 100 });
        setLocations(res.data ?? []);
      } catch (e) {
        console.error("Erro ao carregar unidades:", e);
        setLocations([]);
      }
    }
    loadLocations();
  }, []);

  // reset do filtro de profissional ao trocar unidade
  useEffect(() => {
    setSelectedProfessionalId("all");
  }, [selectedLocationId]);

  // auto refresh (30s)
  useEffect(() => {
    const id = setInterval(() => setRefreshTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // carrega overview + agenda do dia + financeiro do dia
  useEffect(() => {
    async function loadOverview() {
      if (authLoading) return;
      if (!user) return;

      setLoadingOverview(true);
      setError(null);

      try {
        const today = new Date();

        const dayStart = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
          0,
          0,
          0,
          0,
        );
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

        const ymd = `${today.getFullYear()}-${String(
          today.getMonth() + 1,
        ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

        const [overviewResult, agendaResult, financeiro] = await Promise.all([
          fetchOwnerOverview({ locationId: selectedLocationId || undefined }),
          fetchOwnerAgendaDay(ymd, {
            locationId: selectedLocationId || undefined,
          }),
          fetchOwnerFinanceiroWithRange({
            from: dayStart.toISOString(),
            to: dayEnd.toISOString(),
            locationId: selectedLocationId || undefined,
          }),
        ]);

        const updatedKpis = overrideRevenueKpiWithFinance(
          overviewResult.overviewKpis,
          financeiro,
          agendaResult,
        );

        setData({ ...overviewResult, overviewKpis: updatedKpis });
        setAgendaDay(agendaResult);
      } catch (err) {
        console.error("Erro ao carregar overview do owner:", err);
        setError("Erro ao carregar os dados do painel.");
      } finally {
        setLoadingOverview(false);
      }
    }

    loadOverview();
  }, [authLoading, user, selectedLocationId, refreshTick]);

  // ----------------- MEMOS (TODOS OS HOOKS ANTES DOS RETURNS) -----------------

  const professionalsRaw = agendaDay?.professionals ?? [];

  const appointmentsAll = useMemo(() => {
    return agendaDay?.appointments ?? [];
  }, [agendaDay]);

  // ids de profissionais que aparecem nos agendamentos do dia
  const professionalIdsInAgenda = useMemo(() => {
    const set = new Set<string>();
    for (const a of appointmentsAll) {
      if (a?.professionalId) set.add(a.professionalId);
    }
    return set;
  }, [appointmentsAll]);

  // professionalId -> locationId (pega do professional e faz fallback pelo appointment)
  const professionalLocationById = useMemo(() => {
    const map: Record<string, string> = {};

    for (const p of professionalsRaw as any[]) {
      const locId =
        p?.locationId ??
        p?.location?.id ??
        p?.location?.ID ??
        p?.location ??
        "";

      if (p?.id && locId) map[p.id] = String(locId);
    }

    for (const a of appointmentsAll as any[]) {
      const locId = a?.locationId ?? a?.location?.id ?? "";
      if (a?.professionalId && locId && !map[a.professionalId]) {
        map[a.professionalId] = String(locId);
      }
    }

    return map;
  }, [professionalsRaw, appointmentsAll]);

  // profissionais exibidos no select:
  // - com unidade => só daquela unidade (se não der pra inferir, usa os que aparecem na agenda)
  const professionals = useMemo(() => {
    if (!selectedLocationId) return professionalsRaw;

    const byProp = (professionalsRaw as any[]).filter((p) => {
      const locId = p?.locationId ?? p?.location?.id ?? "";
      return String(locId) === String(selectedLocationId);
    });

    if (byProp.length > 0) return byProp as any;

    return (professionalsRaw as any[]).filter((p) =>
      professionalIdsInAgenda.has(p.id),
    );
  }, [professionalsRaw, selectedLocationId, professionalIdsInAgenda]);

  const hasMultipleProfessionals = professionals.length > 1;

  const appointmentsForView = useMemo(() => {
    const list = appointmentsAll;
    if (selectedProfessionalId === "all") {
      return [...list].sort((a, b) => a.startMinutes - b.startMinutes);
    }
    return list
      .filter((a) => a.professionalId === selectedProfessionalId)
      .sort((a, b) => a.startMinutes - b.startMinutes);
  }, [appointmentsAll, selectedProfessionalId]);

  const professionalNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of professionals as any[]) map[p.id] = p.name;
    return map;
  }, [professionals]);

  const appointmentsByTime = useMemo(() => {
    const map = new Map<string, SlotAppt[]>();

    for (const a of appointmentsForView as any[]) {
      const key = a.time; // "08:00"
      const arr = map.get(key) ?? [];
      arr.push({
        id: a.id,
        time: a.time,
        serviceName: a.serviceName,
        customerName: a.customerName,
        professionalId: a.professionalId,
      });
      map.set(key, arr);
    }

    for (const [k, arr] of map.entries()) {
      arr.sort((x, y) => {
        const aa = `${x.serviceName} ${x.customerName}`.toLowerCase();
        const bb = `${y.serviceName} ${y.customerName}`.toLowerCase();
        return aa.localeCompare(bb);
      });
      map.set(k, arr);
    }

    return map;
  }, [appointmentsForView]);

  const showProfessionalOnChip =
    selectedProfessionalId === "all" && professionals.length > 1;

  // Se NÃO tiver unidade selecionada, mas tiver profissional selecionado:
  // usa a unidade do profissional pra montar o horário (08-12/14-20 etc)
  const effectiveLocationIdForSchedule = useMemo(() => {
    if (selectedLocationId) return selectedLocationId;
    if (selectedProfessionalId !== "all") {
      return professionalLocationById[selectedProfessionalId] ?? "";
    }
    return "";
  }, [selectedLocationId, selectedProfessionalId, professionalLocationById]);

  const slotsBuild = useMemo(() => {
    return buildSlotsForToday({
      selectedLocationId: effectiveLocationIdForSchedule,
      locations,
      appointmentsByTime,
    });
  }, [effectiveLocationIdForSchedule, locations, appointmentsByTime]);

  // Próximo agendamento (sempre o próximo >= agora, ignorando cancelled/no_show/done)
  const nextUpcoming = useMemo(() => {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const valid = (appointmentsForView as any[]).filter(
      (a) =>
        a.status !== "cancelled" &&
        a.status !== "no_show" &&
        a.status !== "done",
    );

    const upcoming = valid
      .filter((a) => a.startMinutes >= nowMinutes)
      .sort((a, b) => a.startMinutes - b.startMinutes);

    return upcoming[0] ?? null;
  }, [appointmentsForView, refreshTick]);

  const daySummary = useMemo(() => {
    const list = appointmentsForView as any[];

    const total = list.length;
    const done = list.filter((a) => a.status === "done").length;
    const cancelled = list.filter((a) => a.status === "cancelled").length;
    const noShow = list.filter((a) => a.status === "no_show").length;

    return { total, done, cancelled, noShow };
  }, [appointmentsForView]);

  const weekdayLabel = useMemo(() => {
    const today = new Date();
    const raw = weekdayNames[today.getDay()] ?? "";
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
  }, []);

  // ----------------- RENDERS (AGORA PODE TER RETURNS) -----------------

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

  const { overviewKpis, quickFinancialCards, professionalPayouts } = data;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Visão geral</h1>
          <p className="text-sm text-slate-400">
            Resumo rápido de agenda, planos e financeiro
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Unidade</span>
          <select
            value={selectedLocationId}
            onChange={(e) => {
              const id = e.target.value;
              const params = new URLSearchParams(searchParams.toString());
              if (id) params.set("locationId", id);
              else params.delete("locationId");
              router.replace(`/owner?${params.toString()}`);
            }}
            className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm"
          >
            <option value="">Todas as unidades</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {overviewKpis.map((kpi) => (
          <OverviewKpiCard key={kpi.id} kpi={kpi} />
        ))}
      </section>

      {/* Agenda + Próximo */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Agenda do dia */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3 gap-3">
            <div>
              <p className="text-xs text-slate-400">Agenda da unidade</p>
              <p className="text-sm font-medium">Hoje · {weekdayLabel}</p>
            </div>

            <div className="flex items-center gap-2">
              {hasMultipleProfessionals && (
                <select
                  value={selectedProfessionalId}
                  onChange={(e) => setSelectedProfessionalId(e.target.value)}
                  className="h-8 rounded-lg border border-slate-800 bg-slate-950/60 px-2 text-xs text-slate-100 [color-scheme:dark]"
                  title="Filtrar profissional"
                >
                  <option value="all">Todos</option>
                  {professionals.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  className="px-2 py-1 rounded-lg border border-slate-700 hover:border-emerald-500"
                  onClick={() => goToAgenda("daily")}
                  title="Abrir a agenda completa (diário)"
                >
                  Diário
                </button>

                <button
                  type="button"
                  className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-950/70 text-slate-300 hover:border-emerald-500"
                  onClick={() => goToAgenda("weekly")}
                  title="Ir para a agenda semanal"
                >
                  Semanal
                </button>
              </div>
            </div>
          </div>

          {effectiveLocationIdForSchedule && !slotsBuild.scheduleOk ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              Esta unidade não tem horário configurado para hoje.
              <br />
              Configure o{" "}
              <span className="font-semibold">businessHoursTemplate</span> da
              unidade.
            </div>
          ) : (
            <div className="mt-2 max-h-[340px] overflow-y-auto pr-1">
              <div className="grid grid-cols-4 md:grid-cols-6 gap-2 text-xs">
                {slotsBuild.slots.map((slot) => {
                  const total = slot.appts.length;
                  const first = slot.appts[0];
                  const clickable = total > 0;

                  return (
                    <button
                      key={slot.timeLabel}
                      type="button"
                      disabled={!clickable}
                      onClick={() =>
                        openSlotDetails(slot.timeLabel, slot.appts)
                      }
                      className={[
                        "h-16 rounded-xl border bg-slate-950/40 flex flex-col justify-between p-2 text-left relative transition-colors",
                        clickable
                          ? "border-slate-800/60 hover:border-emerald-500/50"
                          : "border-slate-800/40 opacity-70 cursor-default",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-[10px] text-slate-500">
                          {slot.timeLabel}
                        </span>

                        {total > 0 && (
                          <span className="ml-2 shrink-0 text-[10px] px-2 py-[1px] rounded-md border border-slate-700 bg-slate-950/70 text-slate-200">
                            {total}
                          </span>
                        )}
                      </div>

                      {/* Mostra SÓ 1 chip (os outros só no expand) */}
                      {first ? (
                        <div
                          className="mt-2 text-[11px] bg-emerald-500/10 border border-emerald-500/40 text-emerald-200 rounded-lg px-1 py-[2px] truncate"
                          title={`${first.serviceName} · ${first.customerName}${
                            showProfessionalOnChip
                              ? ` · ${professionalNameById[first.professionalId] ?? "Profissional"}`
                              : ""
                          }`}
                        >
                          {showProfessionalOnChip ? (
                            <span className="text-[10px] text-slate-300 mr-1">
                              {
                                (
                                  professionalNameById[first.professionalId] ??
                                  "Pro"
                                ).split(" ")[0]
                              }
                              :
                            </span>
                          ) : null}
                          {first.serviceName} · {first.customerName}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] text-slate-600" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Próximos horários */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">Próximos horários</p>

            <button
              type="button"
              className="text-[11px] text-emerald-400 hover:underline"
              onClick={() => goToAgenda("daily")}
            >
              Ver agenda completa
            </button>
          </div>

          <div className="space-y-2 text-xs">
            {nextUpcoming ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-slate-400">
                    Próximo agendamento
                  </p>
                  <span className="text-[11px] text-emerald-300 font-semibold">
                    {nextUpcoming.time}
                  </span>
                </div>

                <p className="mt-1 text-sm font-semibold text-slate-100 truncate">
                  {nextUpcoming.serviceName}
                </p>

                <p className="text-[11px] text-slate-400 truncate">
                  {nextUpcoming.customerName}
                  {showProfessionalOnChip
                    ? ` · ${professionalNameById[nextUpcoming.professionalId] ?? "Profissional"}`
                    : ""}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <p className="text-sm font-semibold text-slate-100">
                  Sem mais agendamentos hoje
                </p>

                {daySummary.total > 0 ? (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Resumo do dia: {daySummary.total} total · {daySummary.done}{" "}
                    concluídos · {daySummary.cancelled} cancelados ·{" "}
                    {daySummary.noShow} faltas
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Nenhum agendamento para hoje até o momento.
                  </p>
                )}
              </div>
            )}
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
            {professionalPayouts.map((payout: any) => {
              const params = new URLSearchParams();
              params.set("tab", "payouts");
              params.set("providerId", payout.id);
              if (selectedLocationId)
                params.set("locationId", selectedLocationId);

              return (
                <ProfessionalPayoutRow
                  key={payout.id}
                  payout={payout}
                  href={`/owner/relatorios?${params.toString()}`}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* Modal: detalhes do horário */}
      {expandedSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs shadow-xl">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Agendamentos do horário
                </p>
                <p className="text-sm font-semibold text-slate-100">
                  {expandedSlot.time} · {expandedSlot.appts.length}{" "}
                  agendamento(s)
                </p>
              </div>

              <button
                type="button"
                className="text-[11px] text-slate-400 hover:text-slate-100"
                onClick={closeSlotDetails}
              >
                Fechar
              </button>
            </div>

            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {expandedSlot.appts.map((a) => {
                const prof =
                  professionalNameById[a.professionalId] ?? "Profissional";
                return (
                  <div
                    key={a.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/30 px-3 py-2"
                  >
                    <p className="text-[12px] text-slate-100 font-medium truncate">
                      {a.serviceName}
                    </p>
                    <p className="text-[11px] text-slate-300 truncate">
                      Cliente: {a.customerName}
                    </p>
                    {showProfessionalOnChip ? (
                      <p className="text-[10px] text-slate-500 truncate">
                        Profissional: {prof}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[11px]"
                onClick={closeSlotDetails}
              >
                Fechar
              </button>

              <button
                type="button"
                className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-[11px] text-emerald-100"
                onClick={() => {
                  closeSlotDetails();
                  goToAgenda("daily");
                }}
              >
                Abrir na agenda completa
              </button>
            </div>
          </div>
        </div>
      )}
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
