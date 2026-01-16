// server/web/src/app/(dashboard)/provider/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { fetchProviderMe, type ProviderMeResponse } from "./_api/provider-me";
import {
  fetchMyEarnings,
  type ProviderEarningsResponse,
} from "./_api/provider-earnings";

import {
  OverviewKpiCard,
  type OverviewKpi,
} from "./_components/overview-kpi-card";
import { BellIcon } from "@heroicons/react/24/solid";

// ----------------- Tipos -----------------

type Appointment = {
  id: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status: string;
  clientName: string;
  clientPhone?: string | null;
  serviceName?: string | null;
  service?: { id: string; name: string; durationMin: number };
};

type SlotAppt = {
  id: string;
  time: string; // "08:00"
  startAt: string;
  endAt: string;
  status: string;
  serviceName: string;
  customerName: string;
};

type Slot = {
  timeLabel: string;
  appts: SlotAppt[];
};

type DayInterval = { start: string; end: string };

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

// ----------------- Helpers -----------------
function buildDefaultSlots(stepMin: number) {
  const startMin = 8 * 60; // 08:00
  const endMin = 20 * 60; // 20:00
  const out: string[] = [];
  for (let m = startMin; m <= endMin; m += stepMin) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    out.push(`${hh}:${mm}`);
  }
  return out;
}

function getAgendaStepMin(provider: ProviderMeResponse | null) {
  // tenta pegar de onde existir no teu ProviderMeResponse
  const maybe =
    (provider as any)?.agendaStepMin ??
    (provider as any)?.slotStepMin ??
    (provider as any)?.bookingIntervalMin ??
    (provider as any)?.location?.slotStepMin ??
    (provider as any)?.location?.bookingIntervalMin ??
    (provider as any)?.location?.appointmentStepMin;

  const n = Number(maybe);
  if (Number.isFinite(n) && n > 0) return n;

  return 10; // fallback: teu cenário atual
}

function formatEURFromCents(cents: number) {
  const value = (cents ?? 0) / 100;
  return value.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

function toYYYYMMDD_UTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

function hhmmFromISO(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function timeStrToMinutes(time: string): number {
  const [hStr, mStr] = String(time ?? "").split(":");
  const h = Number(hStr) || 0;
  const m = Number(mStr) || 0;
  return h * 60 + m;
}

function getStatusChipClass(status: string) {
  if (status === "done") {
    return "bg-emerald-500/10 border-emerald-500/40 text-emerald-200";
  }
  if (status === "in_service") {
    return "bg-emerald-500/10 border-emerald-500/40 text-emerald-200";
  }
  if (status === "cancelled") {
    return "bg-rose-500/10 border-rose-500/40 text-rose-200";
  }
  if (status === "no_show") {
    return "bg-amber-500/10 border-amber-500/40 text-amber-200";
  }
  return "bg-sky-500/10 border-sky-500/40 text-sky-200";
}

function getStatusDotClass(status: string) {
  if (status === "done") return "bg-emerald-400";
  if (status === "in_service") return "bg-emerald-400";
  if (status === "cancelled") return "bg-rose-400";
  if (status === "no_show") return "bg-amber-400";
  return "bg-sky-400";
}
function getStatusLabelPT(status: string) {
  if (status === "scheduled") return "Agendado";
  if (status === "in_service") return "Em atendimento";
  if (status === "done") return "Concluído";
  if (status === "no_show") return "Falta";
  if (status === "cancelled") return "Cancelado";
  return status; // fallback
}

function getWeekdayCandidateKeys(date: Date): string[] {
  const map: string[][] = [
    ["sun", "sunday", "dom", "domingo"],
    ["mon", "monday", "seg", "segunda", "segunda-feira"],
    ["tue", "tuesday", "ter", "terça", "terca", "terça-feira", "terca-feira"],
    ["wed", "wednesday", "qua", "quarta", "quarta-feira"],
    ["thu", "thursday", "qui", "quinta", "quinta-feira"],
    ["fri", "friday", "sex", "sexta", "sexta-feira"],
    ["sat", "saturday", "sab", "sábado", "sabado"],
  ];
  return map[date.getDay()] ?? [];
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
  stepMin = 30
): string[] {
  const out: string[] = [];
  for (const itv of intervals) {
    const startMin = timeStrToMinutes(itv.start);
    const endMin = timeStrToMinutes(itv.end);
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) continue;
    if (endMin <= startMin) continue;

    for (let m = startMin; m < endMin; m += stepMin) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      out.push(`${hh}:${mm}`);
    }
  }
  return Array.from(new Set(out)).sort();
}

function getProviderDayIntervals(
  provider: ProviderMeResponse,
  date: Date
): DayInterval[] {
  const template =
    provider?.weekdayTemplate ??
    (provider as any)?.location?.businessHoursTemplate ??
    null;

  if (!template) return [];

  const keys = getWeekdayCandidateKeys(date);
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(template, k)) {
      return normalizeIntervals((template as any)[k]);
    }
  }
  return [];
}

function buildSlotsForToday(params: {
  provider: ProviderMeResponse | null;
  appointmentsByTime: Map<string, SlotAppt[]>;
  stepMin: number;
}): { slots: Slot[]; scheduleOk: boolean } {
  const { provider, appointmentsByTime, stepMin } = params;
  const today = new Date();

  const fallbackLabels = buildDefaultSlots(stepMin);

  if (!provider) {
    const slots: Slot[] = fallbackLabels.map((timeLabel) => ({
      timeLabel,
      appts: appointmentsByTime.get(timeLabel) ?? [],
    }));
    return { slots, scheduleOk: true };
  }

  const intervals = getProviderDayIntervals(provider, today);

  if (!intervals.length) {
    const slots: Slot[] = fallbackLabels.map((timeLabel) => ({
      timeLabel,
      appts: appointmentsByTime.get(timeLabel) ?? [],
    }));
    return { slots, scheduleOk: false };
  }

  const labels = buildSlotsFromIntervals(intervals, stepMin);

  return {
    slots: labels.map((timeLabel) => ({
      timeLabel,
      appts: appointmentsByTime.get(timeLabel) ?? [],
    })),
    scheduleOk: true,
  };
}

function getDayRangeISO(d: Date) {
  const start = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    0,
    0,
    0,
    0
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: end.toISOString() };
}

function capitalizeFirst(s: string) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatTodayHeaderPT() {
  const d = new Date();
  const date = d.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const weekday = d.toLocaleDateString("pt-PT", { weekday: "long" });
  const time = d.toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    date,
    weekday: capitalizeFirst(weekday),
    time,
  };
}

function pillBtnClass(active = false) {
  return [
    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] transition-colors",
    active
      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
      : "border-slate-800 bg-slate-900/40 text-slate-200 hover:border-slate-700",
  ].join(" ");
}

function subtleCardClass(extra?: string) {
  return [
    "rounded-2xl border border-slate-800 bg-slate-900/60",
    "shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_20px_60px_rgba(0,0,0,0.35)]",
    extra ?? "",
  ].join(" ");
}
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function formatWhenLabelPT(dateISO: string) {
  const d = new Date(dateISO);
  const now = new Date();

  if (isSameDay(d, now)) return "Hoje";
  if (isSameDay(d, addDays(now, 1))) return "Amanhã";

  // Ex: 15/01/2026
  return d.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ----------------- Page -----------------

export default function ProviderHomePage() {
  const [provider, setProvider] = useState<ProviderMeResponse | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [earningsMonth, setEarningsMonth] =
    useState<ProviderEarningsResponse | null>(null);
  const [earningsToday, setEarningsToday] =
    useState<ProviderEarningsResponse | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [nextAppointment, setNextAppointment] = useState<Appointment | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const didInitialLoadRef = useRef(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const [expandedSlot, setExpandedSlot] = useState<{
    time: string;
    appts: SlotAppt[];
  } | null>(null);
  const [apptMenuOpen, setApptMenuOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [apptActionLoading, setApptActionLoading] = useState(false);
  const apptMenuRef = useRef<HTMLDivElement | null>(null);

  function openSlotDetails(time: string, appts: SlotAppt[]) {
    if (!appts || appts.length === 0) return;
    setExpandedSlot({ time, appts });
  }

  function closeSlotDetails() {
    setExpandedSlot(null);
  }

  useEffect(() => {
    const id = setInterval(() => setRefreshTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!apptMenuOpen) return;
      const el = apptMenuRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      setApptMenuOpen(false);
    }

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [apptMenuOpen]);

  useEffect(() => {
    let alive = true;

    async function run() {
      const firstLoad = !didInitialLoadRef.current;

      try {
        if (firstLoad) setLoading(true);
        else setRefreshing(true);

        setError(null);

        const me = await fetchProviderMe();
        if (!alive) return;

        const today = new Date();
        const ymd = toYYYYMMDD_UTC(today);
        const { from, to } = getDayRangeISO(today);

        const qs = new URLSearchParams();
        qs.set("date", ymd);
        qs.set("providerId", me.id);
        if (me.locationId) qs.set("locationId", me.locationId);

        // janela grande pra achar o próximo agendamento (ex.: próximos 60 dias)
        const nowISO = new Date().toISOString();
        const toISO = new Date(
          Date.now() + 60 * 24 * 60 * 60 * 1000
        ).toISOString();

        const qsNext = new URLSearchParams();
        qsNext.set("from", nowISO);
        qsNext.set("to", toISO);
        qsNext.set("providerId", me.id);
        if (me.locationId) qsNext.set("locationId", me.locationId);

        // tenta usar from/to (se teu backend suportar). Se não suportar, cai no fallback abaixo.
        const nextApptsWindowPromise = apiClient<Appointment[]>(
          `/appointments?${qsNext.toString()}`
        ).catch(() => null);

        const [appts, month, day, notifs, nextApptsWindow] = await Promise.all([
          apiClient<Appointment[]>(`/appointments?${qs.toString()}`),
          fetchMyEarnings(),
          fetchMyEarnings({ from, to }),
          apiClient<any[]>(`/notifications/me`),
          nextApptsWindowPromise,
        ]);

        if (!alive) return;

        setProvider(me);
        setTodayAppointments(appts ?? []);
        setEarningsMonth(month);
        setEarningsToday(day);
        const list = Array.isArray(notifs) ? notifs : [];
        // ----------- calcula "próximo agendamento real" (pode ser amanhã ou depois) -----------
        const isPending = (a: Appointment) =>
          a.status !== "cancelled" &&
          a.status !== "no_show" &&
          a.status !== "done";

        const pickNextFromList = (list: Appointment[], now: Date) => {
          const candidates = (list ?? [])
            .filter(isPending)
            .filter((a) => new Date(a.startAt).getTime() >= now.getTime())
            .sort(
              (a, b) =>
                new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
            );

          return candidates[0] ?? null;
        };

        let next = null as Appointment | null;
        const now = new Date();

        // 1) tenta pela janela (from/to)
        if (Array.isArray(nextApptsWindow)) {
          next = pickNextFromList(nextApptsWindow, now);
        }

        // 2) fallback: se o endpoint não suportar from/to, varre dia a dia (até 14 dias)
        if (!next) {
          for (let i = 0; i <= 14; i++) {
            const d = addDays(new Date(), i);
            const ymd = toYYYYMMDD_UTC(d);

            const qsDay = new URLSearchParams();
            qsDay.set("date", ymd);
            qsDay.set("providerId", me.id);
            if (me.locationId) qsDay.set("locationId", me.locationId);

            try {
              const dayAppts = await apiClient<Appointment[]>(
                `/appointments?${qsDay.toString()}`
              );

              const found = pickNextFromList(dayAppts ?? [], now);
              if (found) {
                next = found;
                break;
              }
            } catch {
              // se falhar, só continua tentando os próximos dias
            }
          }
        }

        setNextAppointment(next);

        // tenta cobrir os formatos mais comuns:
        // - readAt: null => não lida
        // - isRead: false
        // - read: false
        const count = list.filter((n: any) => {
          if (n?.readAt === null) return true;
          if (typeof n?.isRead === "boolean") return n.isRead === false;
          if (typeof n?.read === "boolean") return n.read === false;
          // fallback: se não tiver campo, não conta como não lida
          return false;
        }).length;

        setUnreadCount(count);

        didInitialLoadRef.current = true;
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Erro ao carregar visão geral do profissional.");
      } finally {
        if (!alive) return;
        if (firstLoad) setLoading(false);
        setRefreshing(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [refreshTick]);
  async function updateApptStatus(apptId: string, nextStatus: string) {
    setApptActionLoading(true);
    try {
      await apiClient(`/appointments/${encodeURIComponent(apptId)}`, {
        method: "PATCH",
        body: { status: nextStatus }, // <- igual seu ProviderAgendaPage
      } as any);

      setRefreshTick((t) => t + 1);
      setApptMenuOpen(false);
      if (nextStatus === "done") {
        setToastMsg("Atendimento concluído");
        setTimeout(() => setToastMsg(null), 1800);
      }
    } finally {
      setApptActionLoading(false);
    }
  }

  // ----------------- MEMOS -----------------

  const todayHeader = useMemo(() => formatTodayHeaderPT(), [refreshTick]);

  const weekdayLabel = useMemo(() => {
    const today = new Date();
    return capitalizeFirst(weekdayNames[today.getDay()] ?? "");
  }, []);

  const appointmentsForView = useMemo(() => {
    return [...(todayAppointments ?? [])].sort((a, b) => {
      const aa = new Date(a.startAt).getTime();
      const bb = new Date(b.startAt).getTime();
      return aa - bb;
    });
  }, [todayAppointments]);

  const appointmentsByTime = useMemo(() => {
    const map = new Map<string, SlotAppt[]>();

    for (const a of appointmentsForView) {
      const time = hhmmFromISO(a.startAt);
      const arr = map.get(time) ?? [];
      arr.push({
        id: a.id,
        time,
        startAt: a.startAt,
        endAt: a.endAt,
        status: a.status,
        serviceName: a.serviceName ?? a.service?.name ?? "Serviço",
        customerName: a.clientName ?? "Cliente",
      });
      map.set(time, arr);
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

  const agendaStepMin = useMemo(() => getAgendaStepMin(provider), [provider]);

  const slotsBuild = useMemo(() => {
    return buildSlotsForToday({
      provider,
      appointmentsByTime,
      stepMin: agendaStepMin,
    });
  }, [provider, appointmentsByTime, agendaStepMin]);

  const daySummary = useMemo(() => {
    const list = appointmentsForView;
    const total = list.length;
    const done = list.filter((a) => a.status === "done").length;
    const cancelled = list.filter((a) => a.status === "cancelled").length;
    const noShow = list.filter((a) => a.status === "no_show").length;

    return { total, done, cancelled, noShow };
  }, [appointmentsForView]);

  // Próximo agendamento (hero)
  // Próximo agendamento (real) — pode ser hoje, amanhã ou depois
  const nextAppointmentHero = useMemo(() => {
    if (!nextAppointment) return null;

    return {
      id: nextAppointment.id,
      when: formatWhenLabelPT(nextAppointment.startAt),
      time: hhmmFromISO(nextAppointment.startAt),
      range: `${hhmmFromISO(nextAppointment.startAt)} - ${hhmmFromISO(
        nextAppointment.endAt
      )}`,
      serviceName:
        nextAppointment.serviceName ??
        nextAppointment.service?.name ??
        "Serviço",
      customerName: nextAppointment.clientName ?? "Cliente",
      phone: nextAppointment.clientPhone ?? null,
      status: nextAppointment.status,
    };
  }, [nextAppointment, refreshTick]);

  const occupancy = useMemo(() => {
    const totalSlots = slotsBuild.slots.length || 1;

    // disponibilidade total em minutos (baseada no step real)
    const availableMin = totalSlots * agendaStepMin;

    // ocupa por tempo: soma duração real dos atendimentos do dia
    const occupiedMin = (appointmentsForView ?? [])
      .filter((a) => a.status !== "cancelled" && a.status !== "no_show")
      .reduce((sum, a) => {
        const start = new Date(a.startAt).getTime();
        const end = new Date(a.endAt).getTime();
        const diffMin = Math.max(0, Math.round((end - start) / 60000));
        return sum + diffMin;
      }, 0);

    const pct = availableMin > 0 ? (occupiedMin / availableMin) * 100 : 0;

    // pra manter “X/Y slots” coerente com step (aproximação)
    const occupiedSlotsApprox =
      agendaStepMin > 0 ? Math.round(occupiedMin / agendaStepMin) : 0;

    return {
      totalSlots,
      occupiedSlots: Math.max(0, occupiedSlotsApprox),
      pctStr: pct.toLocaleString("pt-PT", { maximumFractionDigits: 1 }),
    };
  }, [slotsBuild, appointmentsForView, agendaStepMin]);

  const kpis = useMemo<OverviewKpi[]>(() => {
    const serviceToday = earningsToday?.totals?.servicePriceCents ?? 0;
    const myToday = earningsToday?.totals?.providerEarningsCents ?? 0;

    const serviceMonth = earningsMonth?.totals?.servicePriceCents ?? 0;
    const myMonth = earningsMonth?.totals?.providerEarningsCents ?? 0;

    const billedToday = (earningsToday?.appointments ?? [])
      .filter((a) => a.status === "done")
      .reduce((sum, a) => sum + (a.servicePriceCents ?? 0), 0);

    const myBilledToday = (earningsToday?.appointments ?? [])
      .filter((a) => a.status === "done")
      .reduce((sum, a) => sum + (a.providerEarningsCents ?? 0), 0);

    const totalToday = daySummary.total;

    return [
      {
        id: "today_count",
        title: "Agendamentos hoje",
        value: String(totalToday),
        helper:
          totalToday > 0 ? (
            <span className="text-[11px]">
              <span className="text-emerald-300">
                {daySummary.done} concluídos
              </span>
              <span className="text-slate-500"> · </span>
              <span className="text-rose-500">
                {daySummary.cancelled} cancelados
              </span>
              <span className="text-slate-500"> · </span>
              <span className="text-amber-300">{daySummary.noShow} faltas</span>
            </span>
          ) : (
            "Nenhum agendamento por enquanto"
          ),

        tone: totalToday > 0 ? "positive" : "neutral",
      },
      {
        id: "expected_revenue_today",
        title: "Previsto hoje",
        value: formatEURFromCents(serviceToday),
        helper: null,
        tone: billedToday > 0 ? "positive" : "neutral",
      },

      {
        id: "my_earnings_today",
        title: "Faturamento (Hoje)",
        value: formatEURFromCents(myToday),
        helper: null,
        tone: "positive",
      },

      {
        id: "my_earnings_month",
        title: "Faturamento (mês)",
        value: formatEURFromCents(myMonth),
        helper: `Total em serviços: ${formatEURFromCents(serviceMonth)}`,
        tone: myMonth > 0 ? "positive" : "neutral",
      },
    ];
  }, [earningsToday, earningsMonth, daySummary]);

  // ----------------- RENDER -----------------

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-400">
          Carregando painel do profissional...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-rose-400">{error}</p>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-100">
              Visão geral
            </h1>

            <span className="rounded-full border border-slate-800 bg-slate-900/50 px-2 py-1 text-[11px] text-slate-300">
              {todayHeader.weekday} • {todayHeader.date}
            </span>

            <span className="rounded-full border border-slate-800 bg-slate-900/50 px-2 py-1 text-[11px] text-slate-400">
              Atualizado {todayHeader.time}
            </span>

            {refreshing ? (
              <span className="rounded-full border border-slate-800 bg-slate-900/50 px-2 py-1 text-[11px] text-slate-400">
                Atualizando…
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-sm text-slate-400">
            Tudo que você precisa para o dia de hoje, em 10 segundos.
          </p>

          {provider?.name ? (
            <p className="mt-2 text-sm text-slate-300">
              Bem-vindo(a),{" "}
              <span className="text-slate-100 font-semibold">
                {provider.name}
              </span>
              .
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a href="/provider/agenda" className={pillBtnClass(false)}>
            Abrir agenda
          </a>
          <a href="/provider/ganhos" className={pillBtnClass(true)}>
            Ver ganhos
          </a>
          <a
            href="/provider/notificacoes"
            aria-label="Notificações"
            title="Notificações"
            className={[
              "inline-flex items-center justify-center",
              "h-10 w-10", // mantém alinhado com os botões ao lado
              "rounded-xl",
              "text-slate-200 hover:text-emerald-200",
              "hover:bg-slate-900/35",
              "transition-colors",
              "outline-none focus:outline-none focus-visible:ring-0",
            ].join(" ")}
          >
            {/* wrapper RELATIVE no ícone (badge se posiciona em cima do sino) */}
            <span className="relative inline-flex">
              <BellIcon className="h-7 w-7" />

              {unreadCount > 0 ? (
                <span
                  className={[
                    "absolute -top-2 -right-2", // gruda no canto do sino
                    "flex items-center justify-center",
                    "h-[18px] min-w-[18px] px-[5px]",
                    "rounded-full bg-rose-500 text-white",
                    "text-[10px] font-bold leading-none",
                    "ring-2 ring-slate-950", // contorno escuro (igual badge destacado)
                  ].join(" ")}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </span>
          </a>
        </div>
      </div>

      {/* HERO: Próximo agendamento + resumo rápido */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div
          className={subtleCardClass(
            "lg:col-span-2 p-4 overflow-hidden relative"
          )}
        >
          {/* glow */}
          <div className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-28 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">Próximo agendamento</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">
                {nextAppointmentHero ? (
                  <>
                    <span className="text-slate-400">
                      {nextAppointmentHero.when}
                    </span>{" "}
                    <span className="text-slate-400">•</span>{" "}
                    <span className="text-emerald-200">
                      {nextAppointmentHero.time}
                    </span>{" "}
                    <span className="text-slate-400">•</span>{" "}
                    {nextAppointmentHero.serviceName}
                  </>
                ) : (
                  "Sem próximos agendamentos"
                )}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
                <span className="text-[11px] text-slate-400">Total hoje</span>
                <span className="text-[12px] font-semibold text-slate-100">
                  {daySummary.total}
                </span>
              </span>

              <a
                href="/provider/agenda"
                className="text-[11px] text-emerald-400 hover:underline"
              >
                Ver dia completo
              </a>
            </div>
          </div>

          {nextAppointmentHero ? (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${getStatusDotClass(
                        nextAppointmentHero.status
                      )}`}
                    />
                    <span className="text-[11px] text-slate-400">
                      {nextAppointmentHero.range}
                    </span>
                    <div className="relative" ref={apptMenuRef as any}>
                      <button
                        type="button"
                        onClick={() => setApptMenuOpen((v) => !v)}
                        className={`text-[10px] px-2 py-[2px] rounded-full border ${getStatusChipClass(
                          nextAppointmentHero.status
                        )} hover:opacity-90 transition-opacity`}
                        title="Ações do atendimento"
                      >
                        {getStatusLabelPT(nextAppointmentHero.status)}
                      </button>

                      {apptMenuOpen ? (
                        <div className="absolute z-50 mt-2 w-56 rounded-xl border border-slate-800 bg-slate-950 shadow-xl p-2">
                          <p className="px-2 pb-2 text-[11px] text-slate-400">
                            Ações do agendamento
                          </p>

                          {/* scheduled -> iniciar */}
                          {nextAppointmentHero.status === "scheduled" ? (
                            <button
                              type="button"
                              disabled={apptActionLoading}
                              onClick={() =>
                                updateApptStatus(
                                  nextAppointmentHero.id,
                                  "in_service"
                                )
                              }
                              className="w-full text-left px-3 py-2 rounded-lg text-[12px] text-slate-100 hover:bg-slate-900/60 disabled:opacity-60"
                            >
                              Iniciar atendimento
                            </button>
                          ) : null}

                          {/* in_progress -> concluir */}
                          {nextAppointmentHero.status === "in_service" ? (
                            <button
                              type="button"
                              disabled={apptActionLoading}
                              onClick={() =>
                                updateApptStatus(nextAppointmentHero.id, "done")
                              }
                              className="w-full text-left px-3 py-2 rounded-lg text-[12px] text-emerald-100 hover:bg-emerald-500/10 disabled:opacity-60"
                            >
                              Concluir atendimento
                            </button>
                          ) : null}

                          {/* fallback */}
                          {nextAppointmentHero.status !== "scheduled" &&
                          nextAppointmentHero.status !== "in_service" ? (
                            <div className="px-3 py-2 text-[11px] text-slate-500">
                              Sem ações disponíveis para este status.
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <p className="mt-2 text-base font-semibold text-slate-100 truncate">
                    {nextAppointmentHero.customerName}
                  </p>

                  <p className="mt-1 text-[12px] text-slate-400 truncate">
                    {nextAppointmentHero.serviceName}
                    {nextAppointmentHero.phone
                      ? ` • ${nextAppointmentHero.phone}`
                      : ""}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
              <p className="text-sm font-semibold text-slate-100">
                Dia livre (por enquanto)
              </p>
              <p className="mt-1 text-[12px] text-slate-400">
                Você não tem mais agendamentos pendentes hoje.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href="/provider/agenda"
                  className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/40 text-[12px] text-slate-200 hover:border-slate-700"
                >
                  Ver semana
                </a>
                <a
                  href="/provider/perfil"
                  className="px-3 py-2 rounded-xl border border-emerald-600 bg-emerald-600/15 text-[12px] text-emerald-100 hover:bg-emerald-600/20"
                >
                  Ajustar disponibilidade
                </a>
              </div>
            </div>
          )}
        </div>

        <div className={subtleCardClass("p-4")}>
          <p className="text-xs text-slate-400">Resumo rápido</p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-[11px] text-slate-400">Ocupação hoje</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">
                {occupancy.pctStr}%
              </p>
              <p className="text-[11px] text-slate-500">
                {occupancy.occupiedSlots}/{occupancy.totalSlots} slots
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-[11px] text-slate-400">Agendamentos</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">
                {daySummary.total}
              </p>
              <p className="text-[11px] text-slate-500">total hoje</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-[11px] px-2 py-1 rounded-lg border border-slate-800 bg-slate-950/60 text-slate-200">
              ✅ {daySummary.done} concluídos
            </span>
            <span className="text-[11px] px-2 py-1 rounded-lg border border-slate-800 bg-slate-950/60 text-slate-200">
              ❌ {daySummary.cancelled} cancelados
            </span>
            <span className="text-[11px] px-2 py-1 rounded-lg border border-slate-800 bg-slate-950/60 text-slate-200">
              ⚠️ {daySummary.noShow} faltas
            </span>
          </div>

          <div className="mt-4">
            <a
              href="/provider/notificacoes"
              className="text-[11px] text-emerald-400 hover:underline"
            >
              Ver notificações
            </a>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <OverviewKpiCard key={kpi.id} kpi={kpi} />
        ))}
      </section>

      {/* Agenda + próximos horários */}
      <section className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={subtleCardClass("lg:col-span-2 p-4 flex flex-col")}>
          <div className="flex items-center justify-between mb-3 gap-3">
            <div>
              <p className="text-xs text-slate-400">Minha agenda</p>
              <p className="text-sm font-medium text-slate-100">
                Hoje · {weekdayLabel}
              </p>
            </div>

            <a
              href="/provider/agenda"
              className="text-[11px] text-emerald-400 hover:underline"
            >
              Ver agenda completa
            </a>
          </div>

          {!slotsBuild.scheduleOk ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-300">
              <p className="text-sm font-semibold text-slate-100">
                Horário não configurado
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Não encontramos horário nem no profissional (weekdayTemplate)
                nem na unidade (businessHoursTemplate). Por enquanto, exibimos
                um grid padrão.
              </p>

              <div className="mt-3 flex gap-2">
                <a
                  href="/provider/perfil"
                  className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-[11px] text-emerald-100"
                >
                  Configurar meu horário
                </a>
                <a
                  href="/provider/agenda"
                  className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[11px]"
                >
                  Ver agenda mesmo assim
                </a>
              </div>
            </div>
          ) : null}

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
                    onClick={() => openSlotDetails(slot.timeLabel, slot.appts)}
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

                    {first ? (
                      <div
                        className={`mt-2 text-[11px] border rounded-lg px-1 py-[2px] truncate ${getStatusChipClass(
                          first.status
                        )}`}
                        title={`${first.serviceName} • ${first.customerName}`}
                      >
                        {first.serviceName}
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-slate-600" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className={subtleCardClass("p-4 flex flex-col gap-3")}>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">Próximos horários</p>

            <a
              href="/provider/agenda"
              className="text-[11px] text-emerald-400 hover:underline"
            >
              Ver agenda completa
            </a>
          </div>

          <div className="space-y-2 text-xs">
            {nextAppointmentHero ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-slate-400">Próximo</p>
                  <span className="text-[11px] text-emerald-300 font-semibold">
                    {nextAppointmentHero.time}
                  </span>
                </div>

                <p className="mt-1 text-sm font-semibold text-slate-100 truncate">
                  {nextAppointmentHero.serviceName}
                </p>

                <p className="text-[11px] text-slate-400 truncate">
                  {nextAppointmentHero.customerName}
                </p>

                <div className="mt-3 flex gap-2">
                  <a
                    href="/provider/agenda"
                    className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/40 text-[12px] text-slate-200 hover:border-slate-700"
                  >
                    Abrir agenda
                  </a>
                  <a
                    href="/provider/ganhos"
                    className="px-3 py-2 rounded-xl border border-emerald-600 bg-emerald-600/15 text-[12px] text-emerald-100 hover:bg-emerald-600/20"
                  >
                    Ver ganhos
                  </a>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <p className="text-sm font-semibold text-slate-100">
                  Sem mais agendamentos hoje
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Nenhum agendamento pendente para hoje até o momento.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Modal slots */}
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
              {expandedSlot.appts.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/30 px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] text-slate-100 font-medium truncate">
                      {a.serviceName}
                    </p>
                    <span className="text-[10px] text-slate-500">
                      {hhmmFromISO(a.startAt)} - {hhmmFromISO(a.endAt)}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 truncate">
                    Cliente: {a.customerName}
                  </p>

                  <p className="text-[10px] text-slate-500 truncate">
                    Status: {getStatusLabelPT(a.status)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-[11px]"
                onClick={closeSlotDetails}
              >
                Fechar
              </button>

              <a
                href="/provider/agenda"
                className="px-3 py-2 rounded-xl border border-emerald-600 bg-emerald-600/20 text-[11px] text-emerald-100"
                onClick={closeSlotDetails as any}
              >
                Abrir na agenda completa
              </a>
            </div>
          </div>
        </div>
      )}
      {toastMsg ? (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className="rounded-xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-[12px] text-slate-100 shadow-xl">
            {toastMsg}
          </div>
        </div>
      ) : null}
    </>
  );
}
