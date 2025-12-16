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

import { NextAppointmentCard } from "./_components/next-appointment-card";
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

type DayRange = { startMin: number; endMin: number };

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

// ----------------- Helpers de hora -----------------

function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const clean = String(value).trim();
  const m = clean.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function minutesToTimeLabel(min: number): string {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function safeParseJson(value: any): any {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

// ----------------- Leitura de horário por unidade -----------------

function getBusinessTemplateFromLocation(loc: any): any {
  if (!loc) return null;

  const raw =
    loc.businessHoursTemplate ??
    loc.businessHours ??
    loc.workingHours ??
    loc.openingHours ??
    loc.hoursTemplate ??
    loc.hours ??
    null;

  return safeParseJson(raw);
}

function keysForDayIndex(dayIndex: number): string[] {
  const map: Record<number, string[]> = {
    0: ["sunday", "domingo", "dom", "sun"],
    1: ["monday", "segunda", "seg", "mon"],
    2: ["tuesday", "terca", "terça", "ter", "tue"],
    3: ["wednesday", "quarta", "qua", "wed"],
    4: ["thursday", "quinta", "qui", "thu"],
    5: ["friday", "sexta", "sex", "fri"],
    6: ["saturday", "sabado", "sábado", "sab", "sat"],
  };
  return map[dayIndex] ?? [];
}

function pickDayEntry(template: any, dayIndex: number): any | null {
  if (!template) return null;

  const t = safeParseJson(template);

  // Caso 1: template como array
  if (Array.isArray(t)) {
    const candidates = [
      dayIndex, // 0..6 (domingo..sábado)
      dayIndex === 0 ? 7 : dayIndex, // 1..7
      dayIndex === 0 ? 6 : dayIndex - 1, // 0..6 (segunda..domingo)
    ];

    for (const item of t) {
      const di =
        item?.dayIndex ??
        item?.day ??
        item?.weekdayIndex ??
        item?.dayOfWeek ??
        item?.weekday ??
        null;

      if (typeof di === "number" && candidates.includes(di)) return item;

      const s = typeof di === "string" ? di.toLowerCase() : null;
      if (s) {
        const keys = keysForDayIndex(dayIndex);
        if (keys.includes(s)) return item;
      }
    }

    return null;
  }

  // Caso 2: objeto com chaves
  const keys = keysForDayIndex(dayIndex);
  const containers = [t, t?.days, t?.weeklySchedule].filter(Boolean);

  for (const obj of containers) {
    if (obj && obj[String(dayIndex)] != null) return obj[String(dayIndex)];
    if (obj && obj[String(dayIndex === 0 ? 7 : dayIndex)] != null)
      return obj[String(dayIndex === 0 ? 7 : dayIndex)];

    for (const k of keys) {
      if (obj && obj[k] != null) return obj[k];
    }
  }

  return null;
}

function isClosedDay(dayEntry: any): boolean {
  if (!dayEntry) return false;
  if (dayEntry.closed === true) return true;
  if (dayEntry.isOpen === false) return true;
  if (dayEntry.open === false) return true;
  if (dayEntry.enabled === false) return true;
  if (String(dayEntry.status ?? "").toLowerCase() === "closed") return true;
  if (String(dayEntry.status ?? "").toLowerCase() === "fechado") return true;
  return false;
}

/**
 * Normaliza o dia para ranges.
 * Suporta:
 * - periods/ranges: [{start,end}]
 * - manhã/tarde
 * - start/end + breakStart/breakEnd
 */
function normalizeRangesFromDayEntry(dayEntry: any): DayRange[] {
  if (!dayEntry) return [];
  const d = safeParseJson(dayEntry);

  if (isClosedDay(d)) return [];

  const out: DayRange[] = [];

  // 1) periods/ranges array
  const periods = d.periods ?? d.ranges ?? d.hours ?? d.slots ?? null;

  if (Array.isArray(periods)) {
    for (const p of periods) {
      const startRaw = p.start ?? p.from ?? p.begin ?? p.open ?? p.startTime;
      const endRaw = p.end ?? p.to ?? p.finish ?? p.close ?? p.endTime;

      const s = timeToMinutes(startRaw);
      const e = timeToMinutes(endRaw);

      if (s != null && e != null && e > s) out.push({ startMin: s, endMin: e });
    }
  }

  // 2) manhã/tarde
  const morning = d.morning ?? d.manha ?? d.am ?? null;
  const afternoon = d.afternoon ?? d.tarde ?? d.pm ?? null;

  const mStart = timeToMinutes(
    morning?.from ??
      morning?.start ??
      d.morningFrom ??
      d.morningStart ??
      d.manhaDe
  );
  const mEnd = timeToMinutes(
    morning?.to ?? morning?.end ?? d.morningTo ?? d.morningEnd ?? d.manhaAte
  );

  if (mStart != null && mEnd != null && mEnd > mStart)
    out.push({ startMin: mStart, endMin: mEnd });

  const aStart = timeToMinutes(
    afternoon?.from ??
      afternoon?.start ??
      d.afternoonFrom ??
      d.afternoonStart ??
      d.tardeDe
  );
  const aEnd = timeToMinutes(
    afternoon?.to ??
      afternoon?.end ??
      d.afternoonTo ??
      d.afternoonEnd ??
      d.tardeAte
  );

  if (aStart != null && aEnd != null && aEnd > aStart)
    out.push({ startMin: aStart, endMin: aEnd });

  // 3) start/end + break
  if (out.length === 0) {
    const startMin = timeToMinutes(
      d.start ?? d.open ?? d.openingTime ?? d.openTime
    );
    const endMin = timeToMinutes(
      d.end ?? d.close ?? d.closingTime ?? d.closeTime
    );

    const breakStartMin = timeToMinutes(d.breakStart ?? d.lunchStart);
    const breakEndMin = timeToMinutes(d.breakEnd ?? d.lunchEnd);

    if (startMin != null && endMin != null && endMin > startMin) {
      if (
        breakStartMin != null &&
        breakEndMin != null &&
        breakEndMin > breakStartMin
      ) {
        if (breakStartMin > startMin)
          out.push({ startMin, endMin: breakStartMin });
        if (endMin > breakEndMin) out.push({ startMin: breakEndMin, endMin });
      } else {
        out.push({ startMin, endMin });
      }
    }
  }

  return out
    .filter(
      (r) =>
        Number.isFinite(r.startMin) &&
        Number.isFinite(r.endMin) &&
        r.endMin > r.startMin
    )
    .sort((a, b) => a.startMin - b.startMin);
}

// ----------------- EXTRAÇÃO ROBUSTA de slots do payload da agenda -----------------

function uniqSorted(labels: string[]): string[] {
  const clean = labels
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .map((x) => x.slice(0, 5)); // "HH:mm"
  return Array.from(new Set(clean)).sort((a, b) => a.localeCompare(b));
}

function extractSlotLabelsFromAgendaDay(agendaDay: any): string[] | null {
  if (!agendaDay) return null;

  const candidates = [
    agendaDay.timeSlots,
    agendaDay.slotTimes,
    agendaDay.times,
    agendaDay.grid,
    agendaDay.scheduleSlots,
    // MUITO comum: "slots" como array (de string/obj) OU map
    agendaDay.slots,
    agendaDay.daySlots,
    agendaDay.availableSlots,
  ];

  for (const c of candidates) {
    const value = safeParseJson(c);

    // 1) array de strings
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      typeof value[0] === "string"
    ) {
      return uniqSorted(value);
    }

    // 2) array de números (minutos)
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      typeof value[0] === "number"
    ) {
      return uniqSorted(value.map((m: number) => minutesToTimeLabel(m)));
    }

    // 3) array de objetos (muito provável)
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      typeof value[0] === "object"
    ) {
      const labels: string[] = [];

      for (const item of value) {
        const raw =
          item?.timeLabel ??
          item?.time ??
          item?.label ??
          item?.startTime ??
          item?.start ??
          item?.from ??
          null;

        // pode vir "startMinutes"
        const startMinutes =
          typeof item?.startMinutes === "number" ? item.startMinutes : null;

        const t =
          typeof raw === "string"
            ? raw
            : startMinutes != null
            ? minutesToTimeLabel(startMinutes)
            : null;

        if (t) labels.push(String(t).slice(0, 5));
      }

      const out = uniqSorted(labels);
      if (out.length > 0) return out;
    }

    // 4) map/object: { "08:00": ..., "08:30": ... }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const keys = Object.keys(value).filter((k) => /^\d{1,2}:\d{2}/.test(k));
      const out = uniqSorted(keys);
      if (out.length > 0) return out;
    }
  }

  return null;
}

function extractRangesFromAgendaDay(agendaDay: any): DayRange[] {
  if (!agendaDay) return [];

  const candidates = [
    agendaDay.daySchedule,
    agendaDay.schedule,
    agendaDay.businessHours,
    agendaDay.locationHours,
    agendaDay.locationSchedule,
    agendaDay.workingHours,
    agendaDay.openingHours,
    agendaDay.businessHoursTemplate,
    agendaDay.weekdayTemplate,
  ].filter(Boolean);

  const dayIndex = new Date().getDay();

  for (const c of candidates) {
    const template = safeParseJson(c);
    const dayEntry = pickDayEntry(template, dayIndex);
    const ranges = normalizeRangesFromDayEntry(dayEntry);
    if (ranges.length > 0) return ranges;
  }

  const direct = agendaDay.ranges ?? agendaDay.periods ?? null;
  if (Array.isArray(direct) && direct.length > 0) {
    const ranges = normalizeRangesFromDayEntry({ periods: direct });
    if (ranges.length > 0) return ranges;
  }

  return [];
}

function buildSlotsForToday(params: {
  selectedLocationId: string;
  locations: any[];
  agendaDay: any;
  appointmentsByTime: Map<string, SlotAppt[]>;
}): { slots: Slot[]; scheduleOk: boolean } {
  const { selectedLocationId, locations, agendaDay, appointmentsByTime } =
    params;

  // sem filtro: grid padrão 08:00-20:00
  if (!selectedLocationId) {
    const start = 8 * 60;
    const end = 20 * 60;
    const slots: Slot[] = [];
    for (let min = start; min < end; min += 30) {
      const timeLabel = minutesToTimeLabel(min);
      slots.push({ timeLabel, appts: appointmentsByTime.get(timeLabel) ?? [] });
    }
    return { slots, scheduleOk: true };
  }

  // ✅ 1) PRIORIDADE: slots do endpoint da agenda (robusto agora)
  const labels = extractSlotLabelsFromAgendaDay(agendaDay);
  if (labels && labels.length > 0) {
    const slots: Slot[] = labels.map((timeLabel) => ({
      timeLabel,
      appts: appointmentsByTime.get(timeLabel) ?? [],
    }));
    return { slots, scheduleOk: true };
  }

  // ✅ 2) ranges vindos do endpoint da agenda
  const rangesFromAgenda = extractRangesFromAgendaDay(agendaDay);
  if (rangesFromAgenda.length > 0) {
    const result: Slot[] = [];
    for (const r of rangesFromAgenda) {
      for (let min = r.startMin; min < r.endMin; min += 30) {
        const timeLabel = minutesToTimeLabel(min);
        result.push({
          timeLabel,
          appts: appointmentsByTime.get(timeLabel) ?? [],
        });
      }
    }
    return { slots: result, scheduleOk: true };
  }

  // ✅ 3) fallback: tentar ler do locations (se vier completo)
  const loc = locations.find((l) => l.id === selectedLocationId) ?? null;
  const template = getBusinessTemplateFromLocation(loc);

  const dayIndex = new Date().getDay();
  const dayEntry = pickDayEntry(template, dayIndex);
  const ranges = normalizeRangesFromDayEntry(dayEntry);

  if (ranges.length === 0) {
    return { slots: [], scheduleOk: false };
  }

  const result: Slot[] = [];
  for (const r of ranges) {
    for (let min = r.startMin; min < r.endMin; min += 30) {
      const timeLabel = minutesToTimeLabel(min);
      result.push({
        timeLabel,
        appts: appointmentsByTime.get(timeLabel) ?? [],
      });
    }
  }

  return { slots: result, scheduleOk: true };
}

// ----- helper para sobrescrever o KPI de receita prevista/faturada -----
function overrideRevenueKpiWithFinance(
  kpis: OverviewKpi[],
  financeiro: OwnerFinanceiroData,
  agenda: OwnerAgendaDay
): OverviewKpi[] {
  const previstoPlanos = financeiro.planPayments.reduce(
    (sum, p) => sum + p.amount,
    0
  );

  const faturadoPlanos = financeiro.planPayments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);

  const avulsosValidos = agenda.appointments.filter(
    (a) =>
      a.billingType === "avulso" &&
      a.status !== "cancelled" &&
      a.status !== "no_show"
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
      : kpi
  );
}

export default function FluxoOwnerDashboard() {
  const { user, loading: authLoading } = useRequireAuth({
    requiredRole: "owner",
  });

  const [data, setData] = useState<OwnerOverview | null>(null);
  const [agendaDay, setAgendaDay] = useState<OwnerAgendaDay | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  const [locations, setLocations] = useState<OwnerLocation[]>([]);
  const selectedLocationId = searchParams.get("locationId") ?? "";
  const [selectedProfessionalId, setSelectedProfessionalId] =
    useState<string>("all");

  // carrega unidades
  useEffect(() => {
    async function loadLocations() {
      try {
        const res: any = await fetchOwnerLocations();

        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.locations)
          ? res.locations
          : Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.items)
          ? res.items
          : [];

        setLocations(list);
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
          0
        );
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

        const ymd = `${today.getFullYear()}-${String(
          today.getMonth() + 1
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
          agendaResult
        );

        setData({
          ...overviewResult,
          overviewKpis: updatedKpis,
        });

        setAgendaDay(agendaResult);
      } catch (err) {
        console.error("Erro ao carregar overview do owner:", err);
        setError("Erro ao carregar os dados do painel.");
      } finally {
        setLoadingOverview(false);
      }
    }

    loadOverview();
  }, [authLoading, user, selectedLocationId]);

  // ----------- memos -----------

  const professionals = agendaDay?.professionals ?? [];
  const hasMultipleProfessionals = professionals.length > 1;

  const appointmentsForView = useMemo(() => {
    const list = agendaDay?.appointments ?? [];
    if (selectedProfessionalId === "all") {
      return [...list].sort((a, b) => a.startMinutes - b.startMinutes);
    }
    return list
      .filter((a) => a.professionalId === selectedProfessionalId)
      .sort((a, b) => a.startMinutes - b.startMinutes);
  }, [agendaDay, selectedProfessionalId]);

  const professionalNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of professionals) map[p.id] = p.name;
    return map;
  }, [professionals]);

  const appointmentsByTime = useMemo(() => {
    const map = new Map<string, SlotAppt[]>();

    for (const a of appointmentsForView) {
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
      arr.sort((x, y) => x.time.localeCompare(y.time));
      map.set(k, arr);
    }

    return map;
  }, [appointmentsForView]);

  const showProfessionalOnChip =
    selectedProfessionalId === "all" && professionals.length > 1;

  const slotsBuild = useMemo(() => {
    return buildSlotsForToday({
      selectedLocationId,
      locations,
      agendaDay,
      appointmentsByTime,
    });
  }, [selectedLocationId, locations, agendaDay, appointmentsByTime]);

  // ----------------- renders -----------------

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

  const {
    overviewKpis,
    nextAppointments,
    quickFinancialCards,
    professionalPayouts,
  } = data;

  const today = new Date();
  const weekdayLabelRaw = weekdayNames[today.getDay()] ?? "";
  const weekdayLabel =
    weekdayLabelRaw.charAt(0).toUpperCase() + weekdayLabelRaw.slice(1);

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

      {/* Metric cards */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {overviewKpis.map((kpi) => (
          <OverviewKpiCard key={kpi.id} kpi={kpi} />
        ))}
      </section>

      {/* Agenda + Lista lateral */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar real (slots do dia) */}
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
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex gap-2 text-xs">
                <button className="px-2 py-1 rounded-lg border border-slate-700 hover:border-emerald-500">
                  Diário
                </button>
                <button className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-950/70 text-slate-400">
                  Semanal
                </button>
              </div>
            </div>
          </div>

          {selectedLocationId && !slotsBuild.scheduleOk ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              Esta unidade não tem horário configurado para hoje (ou o endpoint
              da agenda não retornou os slots).
              <br />
              Se a página “Agenda” mostra os horários, então aqui o payload está
              vindo num formato diferente — agora o extractor já cobre strings,
              objetos e maps.
            </div>
          ) : (
            <div className="mt-2 max-h-[340px] overflow-y-auto pr-1">
              <div className="grid grid-cols-4 md:grid-cols-6 gap-2 text-xs">
                {slotsBuild.slots.map((slot) => (
                  <div
                    key={slot.timeLabel}
                    className="h-16 rounded-xl border border-slate-800/60 bg-slate-950/40 flex flex-col justify-between p-2"
                  >
                    <span className="text-[10px] text-slate-500">
                      {slot.timeLabel}
                    </span>

                    {slot.appts.length > 0 && (
                      <div className="flex flex-col gap-1">
                        {slot.appts.slice(0, 2).map((a) => {
                          const prof =
                            professionalNameById[a.professionalId] ??
                            "Profissional";

                          return (
                            <div
                              key={a.id}
                              className="text-[11px] bg-emerald-500/10 border border-emerald-500/40 text-emerald-200 rounded-lg px-1 py-[2px] truncate"
                              title={`${a.serviceName} · ${a.customerName}${
                                showProfessionalOnChip ? ` · ${prof}` : ""
                              }`}
                            >
                              {showProfessionalOnChip ? (
                                <span className="text-[10px] text-slate-300 mr-1">
                                  {prof.split(" ")[0]}:
                                </span>
                              ) : null}
                              {a.serviceName} · {a.customerName}
                            </div>
                          );
                        })}

                        {slot.appts.length > 2 && (
                          <div className="text-[10px] text-slate-500">
                            +{slot.appts.length - 2} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Próximos horários */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">Próximos horários</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ver agenda completa
            </button>
          </div>
          <div className="space-y-2 text-xs">
            {nextAppointments.map((appt) => (
              <NextAppointmentCard key={appt.id} appointment={appt} />
            ))}
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
            {professionalPayouts.map((payout) => (
              <ProfessionalPayoutRow key={payout.id} payout={payout} />
            ))}
          </div>
        </div>
      </section>
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
