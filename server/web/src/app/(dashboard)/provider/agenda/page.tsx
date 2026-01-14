"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRequireAuth } from "@/lib/use-auth";
import { apiClient, ApiError } from "@/lib/api-client";

type ProviderMe = {
  id: string;
  name?: string;
  user?: { name?: string };
};

type AppointmentStatus =
  | "scheduled"
  | "in_service"
  | "done"
  | "no_show"
  | "cancelled";

type ProviderAppointment = {
  id: string;
  time: string; // "HH:mm"
  serviceName: string;
  customerName: string;
  status: AppointmentStatus;
  billingType?: "plan" | "single";
  durationMin?: number;
};

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

export default function ProviderAgendaPage() {
  const { user, loading: authLoading } = useRequireAuth({
    requiredRole: "provider",
  });

  const [provider, setProvider] = useState<ProviderMe | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [appointments, setAppointments] = useState<ProviderAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAppt, setSelectedAppt] = useState<ProviderAppointment | null>(
    null
  );
  const [refreshTick, setRefreshTick] = useState(0);

  function triggerReload() {
    setRefreshTick((t) => t + 1);
  }

  function handleOpenDetails(appt: ProviderAppointment) {
    setSelectedAppt(appt);
  }

  const today = new Date();
  const todayStr = formatDateYYYYMMDD(today);
  const selectedDateStr = formatDateYYYYMMDD(selectedDate);
  const isToday = selectedDateStr === todayStr;

  const maxDate = addDays(today, 30);
  const maxDateStr = formatDateYYYYMMDD(maxDate);

  const weekdayLabel = getWeekdayLabel(selectedDate);
  const dateLabel = isToday
    ? `Hoje · ${weekdayLabel}`
    : `${selectedDate.toLocaleDateString("pt-PT")} · ${weekdayLabel}`;

  const agendaStepMin = 30;

  const morningSlots = useMemo(
    () => DEFAULT_TIME_SLOTS.filter((t) => t < "14:00"),
    []
  );
  const afternoonSlots = useMemo(
    () => DEFAULT_TIME_SLOTS.filter((t) => t >= "14:00"),
    []
  );

  const stats = useMemo(() => {
    const total = appointments.length;

    let scheduled = 0;
    let inService = 0;
    let done = 0;
    let noShow = 0;
    let cancelled = 0;

    let planCount = 0;
    let avulsoCount = 0;

    for (const appt of appointments) {
      if (appt.billingType === "plan") planCount++;
      else avulsoCount++;

      switch (appt.status) {
        case "scheduled":
          scheduled++;
          break;
        case "in_service":
          inService++;
          break;
        case "done":
          done++;
          break;
        case "no_show":
          noShow++;
          break;
        case "cancelled":
          cancelled++;
          break;
      }
    }

    return {
      total,
      planCount,
      avulsoCount,
      scheduled,
      inService,
      done,
      noShow,
      cancelled,
    };
  }, [appointments]);

  // 1) carrega provider/me
  useEffect(() => {
    let alive = true;

    async function loadProviderMe() {
      if (authLoading) return;
      if (!user) return;

      try {
        setError(null);
        const me = await apiClient<ProviderMe>("/providers/me");
        if (!alive) return;
        setProvider(me);
      } catch (err) {
        console.error("Erro ao carregar providers/me:", err);
        if (!alive) return;

        const msg =
          err instanceof ApiError
            ? err.message
            : "Erro ao carregar perfil do profissional.";

        setError(msg);
      }
    }

    loadProviderMe();

    return () => {
      alive = false;
    };
  }, [authLoading, user]);

  // 2) carrega appointments do dia com providerId
  useEffect(() => {
    let alive = true;

    async function loadDay() {
      if (authLoading) return;
      if (!user) return;
      if (!provider?.id) return;

      try {
        setLoading(true);
        setError(null);

        const dateStr = formatDateYYYYMMDD(selectedDate);

        const raw = await apiClient<any>(
          `/appointments?date=${encodeURIComponent(
            dateStr
          )}&providerId=${encodeURIComponent(provider.id)}`
        );

        const list = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.data)
          ? raw.data
          : [];

        const normalized = normalizeAppointments(list);

        if (!alive) return;
        setAppointments(normalized);
      } catch (err) {
        console.error("Erro ao carregar agenda do profissional:", err);
        if (!alive) return;

        const msg =
          err instanceof ApiError
            ? err.message
            : "Erro ao carregar agenda do dia.";

        setError(msg);
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadDay();

    return () => {
      alive = false;
    };
  }, [authLoading, user, provider?.id, selectedDate, refreshTick]);

  function handlePrevDay() {
    setSelectedDate((prev) => addDays(prev, -1));
  }

  function handleNextDay() {
    setSelectedDate((prev) => addDays(prev, 1));
  }

  if (authLoading || loading) {
    return <div className="text-sm text-slate-400">Carregando agenda...</div>;
  }

  if (error) {
    return <div className="text-sm text-rose-400">{error}</div>;
  }

  const providerName = provider?.name ?? provider?.user?.name ?? "Profissional";

  const isPastDay = selectedDateStr < todayStr;
  const nowMinutes = today.getHours() * 60 + today.getMinutes();

  return (
    <>
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Agenda</h1>
          <p className="text-xs text-slate-400">
            Profissional: <span className="text-slate-200">{providerName}</span>{" "}
            — {weekdayLabel.toLowerCase()},{" "}
            {selectedDate.toLocaleDateString("pt-PT")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-300"
              onClick={handlePrevDay}
            >
              {"<"}
            </button>

            <button
              type="button"
              className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-300"
              onClick={handleNextDay}
            >
              {">"}
            </button>

            <button className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900/80">
              {dateLabel}
            </button>

            <input
              type="date"
              className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200 text-xs"
              value={selectedDateStr}
              max={maxDateStr}
              onChange={(e) => {
                if (!e.target.value) return;
                const [y, m, d] = e.target.value.split("-").map(Number);
                setSelectedDate(new Date(y, m - 1, d, 0, 0, 0, 0));
              }}
            />
          </div>
        </div>
      </header>

      {/* Resumo */}
      <section className="mb-4 grid gap-2 text-xs md:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
          <p className="text-[11px] text-slate-400">Atendimentos</p>
          <p className="text-lg font-semibold text-slate-50">{stats.total}</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-400">Plano</p>
            <p className="text-sm font-semibold text-emerald-300">
              {stats.planCount}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">Avulso</p>
            <p className="text-sm font-semibold text-slate-100">
              {stats.avulsoCount}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
          <p className="text-[11px] text-slate-400 mb-1">Status</p>
          <p className="text-[11px] text-slate-300">
            Agendados: <span className="text-slate-50">{stats.scheduled}</span>
          </p>
          <p className="text-[11px] text-slate-300">
            Em atendimento:{" "}
            <span className="text-emerald-300">{stats.inService}</span>
          </p>
          <p className="text-[11px] text-slate-300">
            Concluídos: <span className="text-sky-300">{stats.done}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
          <p className="text-[11px] text-slate-400 mb-1">Ausências</p>
          <p className="text-[11px] text-slate-300">
            Faltas: <span className="text-amber-300">{stats.noShow}</span>
          </p>
          <p className="text-[11px] text-slate-300">
            Cancelados: <span className="text-rose-300">{stats.cancelled}</span>
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Manhã */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
              Período da manhã
            </p>

            <div className="flex flex-col gap-2">
              <div className="px-2 py-2 rounded-2xl border border-slate-700/80 bg-slate-950/70 flex flex-col">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">
                  Profissional
                </span>
                <span className="text-sm font-semibold text-slate-50">
                  {providerName}
                </span>
              </div>

              <ProviderTimeline
                periodLabel="Manhã"
                periodStart={morningSlots?.[0] ?? "08:00"}
                periodEnd={morningSlots?.[morningSlots.length - 1] ?? "13:30"}
                stepMin={agendaStepMin}
                appointments={appointments}
                isPastDay={isPastDay}
                isToday={isToday}
                nowMinutes={nowMinutes}
                onOpenDetails={handleOpenDetails}
              />
            </div>
          </div>

          {/* Tarde */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
              Período da tarde
            </p>

            <div className="flex flex-col gap-2">
              <div className="px-2 py-2 rounded-2xl border border-slate-700/80 bg-slate-950/70 flex flex-col">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">
                  Profissional
                </span>
                <span className="text-sm font-semibold text-slate-50">
                  {providerName}
                </span>
              </div>

              <ProviderTimeline
                periodLabel="Tarde"
                periodStart={afternoonSlots?.[0] ?? "14:00"}
                periodEnd={
                  afternoonSlots?.[afternoonSlots.length - 1] ?? "20:00"
                }
                stepMin={agendaStepMin}
                appointments={appointments}
                isPastDay={isPastDay}
                isToday={isToday}
                nowMinutes={nowMinutes}
                onOpenDetails={handleOpenDetails}
              />
            </div>
          </div>
        </div>
      </section>

      {selectedAppt && (
        <AppointmentDetailsModal
          appt={selectedAppt}
          onClose={() => setSelectedAppt(null)}
          onChangeDone={() => {
            setSelectedAppt(null);
            triggerReload();
          }}
        />
      )}
    </>
  );
}

/** Timeline simplificada (mesma lógica do owner): slots + blocos clicáveis */
function ProviderTimeline({
  periodLabel,
  periodStart,
  periodEnd,
  stepMin,
  appointments,
  isPastDay,
  isToday,
  nowMinutes,
  onOpenDetails,
}: {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  stepMin: number;
  appointments: ProviderAppointment[];
  isPastDay: boolean;
  isToday: boolean;
  nowMinutes: number;
  onOpenDetails: (appt: ProviderAppointment) => void;
}) {
  const rowPx = 56;

  const startMin = timeStrToMinutes(periodStart);
  const lastStartMin = timeStrToMinutes(periodEnd);

  const groups = useMemo(() => {
    const list = appointments
      .filter((a) => a.status !== "cancelled")
      .map((a) => {
        const sMin = timeStrToMinutes(a.time);
        const dur = Number(a.durationMin ?? stepMin);
        const durSafe = Number.isFinite(dur) && dur > 0 ? dur : stepMin;
        const eMin = sMin + durSafe;
        return { appt: a, startMin: sMin, endMin: eMin, durMin: durSafe };
      })
      .sort((a, b) => a.startMin - b.startMin);

    const map = new Map<number, typeof list>();
    for (const item of list) {
      const arr = map.get(item.startMin) ?? [];
      arr.push(item);
      map.set(item.startMin, arr);
    }

    return Array.from(map.entries())
      .map(([k, items]) => ({
        startMin: k,
        items,
        maxEndMin: Math.max(...items.map((x) => x.endMin)),
        maxDurMin: Math.max(...items.map((x) => x.durMin)),
      }))
      .sort((a, b) => a.startMin - b.startMin);
  }, [appointments, stepMin]);

  const nodes: React.ReactNode[] = [];
  let cursor = startMin;
  let guard = 0;

  while (cursor <= lastStartMin && guard < 2000) {
    guard++;

    const nextGroup = groups.find((g) => g.startMin >= cursor);

    if (!nextGroup) {
      while (cursor <= lastStartMin && guard < 2000) {
        guard++;
        nodes.push(
          renderSlot(
            periodLabel,
            cursor,
            stepMin,
            rowPx,
            isPastDay,
            isToday,
            nowMinutes
          )
        );
        cursor += stepMin;
      }
      break;
    }

    while (cursor + stepMin <= nextGroup.startMin && cursor <= lastStartMin) {
      nodes.push(
        renderSlot(
          periodLabel,
          cursor,
          stepMin,
          rowPx,
          isPastDay,
          isToday,
          nowMinutes
        )
      );
      cursor += stepMin;
    }

    if (cursor > lastStartMin) break;

    const blockHeightPx = Math.max(
      rowPx,
      (nextGroup.maxDurMin / stepMin) * rowPx
    );

    if (nextGroup.items.length === 1) {
      const one = nextGroup.items[0].appt;
      const st = getStatusClasses(one.status);
      const billing =
        one.billingType === "plan"
          ? "Plano"
          : one.billingType === "single"
          ? "Avulso"
          : "—";

      nodes.push(
        <button
          type="button"
          key={`appt-${one.id}`}
          onClick={() => onOpenDetails(one)}
          className={`w-full rounded-xl border px-2 py-2 text-left transition hover:brightness-110 ${st.container}`}
          style={{ height: blockHeightPx }}
          title={`${one.time} · ${one.serviceName} · ${one.customerName} · ${st.label}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] text-slate-300">{one.time}</p>
              <p className="text-[12px] font-medium text-slate-100 truncate">
                {one.serviceName}
              </p>
              <p className="text-[10px] text-slate-300 truncate">
                Cliente: {one.customerName}
              </p>
              <p className="text-[10px] text-slate-500">Tipo: {billing}</p>
            </div>

            <span className={`text-[9px] px-2 py-[2px] rounded ${st.badge}`}>
              {st.label}
            </span>
          </div>
        </button>
      );
    } else {
      const count = nextGroup.items.length;
      const slotTime = minutesToTimeStr(nextGroup.startMin);

      nodes.push(
        <button
          type="button"
          key={`over-${nextGroup.startMin}`}
          onClick={() => onOpenDetails(nextGroup.items[0].appt)}
          className="w-full rounded-xl border px-2 py-2 text-left border-amber-500/40 bg-amber-500/10 transition hover:brightness-110"
          style={{ height: blockHeightPx }}
          title={`${slotTime} · Overbooking (${count} agendamentos)`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] text-slate-300">{slotTime}</p>
              <p className="text-[12px] font-medium text-slate-100 truncate">
                Overbooking
              </p>
              <p className="text-[10px] text-slate-300 truncate">
                {count} agendamentos neste horário
              </p>
            </div>

            <span className="text-[9px] px-2 py-[2px] rounded border border-amber-400/60 bg-amber-500/20 text-amber-100">
              +{count - 1}
            </span>
          </div>
        </button>
      );
    }

    cursor = nextGroup.maxEndMin;
  }

  return <div className="flex flex-col gap-2">{nodes}</div>;
}

function AppointmentDetailsModal({
  appt,
  onClose,
  onChangeDone,
}: {
  appt: ProviderAppointment;
  onClose: () => void;
  onChangeDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const statusStyles = getStatusClasses(appt.status);
  const billingType = appt.billingType;

  async function setStatus(status: AppointmentStatus) {
    try {
      setBusy(true);

      await apiClient(`/appointments/${encodeURIComponent(appt.id)}`, {
        method: "PATCH",
        body: { status },
      });

      onChangeDone();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Erro ao atualizar status.";
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  async function cancelAppointment() {
    try {
      setBusy(true);

      await apiClient(`/appointments/${encodeURIComponent(appt.id)}`, {
        method: "DELETE",
      });

      onChangeDone();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Erro ao cancelar agendamento.";
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  function handleDetailsStatusChange(forceStatus?: AppointmentStatus) {
    // replica o “clique muda status” do owner, mas aqui decide direto:
    // scheduled -> in_service, in_service -> done
    if (forceStatus) return setStatus(forceStatus);

    if (appt.status === "scheduled") return setStatus("in_service");
    if (appt.status === "in_service") return setStatus("done");
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs shadow-xl">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              Detalhes do agendamento
            </p>
            <p className="text-sm font-semibold text-slate-100">
              {appt.serviceName}
            </p>
            <p className="text-[11px] text-slate-300">
              Cliente: {appt.customerName}
            </p>
            <p className="text-[11px] text-slate-400">Horário: {appt.time}</p>
          </div>

          <button
            className="text-[11px] text-slate-400 hover:text-slate-100"
            onClick={onClose}
            disabled={busy}
          >
            Fechar
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <span
            className={`text-[10px] px-2 py-0.5 rounded ${statusStyles.badge}`}
          >
            {statusStyles.label}
          </span>

          <span
            className={`text-[10px] px-2 py-0.5 rounded border ${
              billingType === "plan"
                ? "bg-emerald-500/15 text-emerald-100 border-emerald-400/60"
                : "bg-slate-700/40 text-slate-100 border-slate-500/60"
            }`}
          >
            {billingType === "plan" ? "Plano" : "Avulso"}
          </span>
        </div>

        <div className="space-y-2 mb-4">
          {appt.status === "scheduled" && (
            <button
              type="button"
              disabled={busy}
              className="w-full px-3 py-1 rounded-lg border border-emerald-500 bg-emerald-500/10 text-[11px] text-emerald-100 disabled:opacity-60"
              onClick={() => handleDetailsStatusChange()}
            >
              Iniciar atendimento
            </button>
          )}

          {/* Se você ainda não quer encaixe no Provider, pode remover este botão,
              mas deixei igual ao owner no visual. */}
          <button
            type="button"
            disabled={busy}
            className="w-full px-3 py-1 rounded-lg border border-amber-400 bg-amber-500/10 text-[11px] text-amber-200 disabled:opacity-60"
            onClick={() =>
              alert(
                "Encaixe no Provider: se quiser, eu implemento igual ao owner."
              )
            }
          >
            + Encaixar outro cliente neste horário
          </button>

          {appt.status === "in_service" && (
            <button
              type="button"
              disabled={busy}
              className="w-full px-3 py-1 rounded-lg border border-sky-500 bg-sky-500/10 text-[11px] text-sky-100 disabled:opacity-60"
              onClick={() => handleDetailsStatusChange()}
            >
              Marcar como concluído
            </button>
          )}

          {(appt.status === "scheduled" || appt.status === "in_service") && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                className="flex-1 px-3 py-1 rounded-lg border border-amber-400 bg-amber-500/10 text-[11px] text-amber-200 disabled:opacity-60"
                onClick={() => handleDetailsStatusChange("no_show")}
              >
                Marcar falta
              </button>

              <button
                type="button"
                disabled={busy}
                className="flex-1 px-3 py-1 rounded-lg border border-rose-400 bg-rose-500/10 text-[11px] text-rose-200 disabled:opacity-60"
                onClick={cancelAppointment}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        <p className="text-[10px] text-slate-500">
          Dica: use este painel para controlar status, faltas e exceções de
          forma segura, sem lotar o slot da agenda.
        </p>
      </div>
    </div>
  );
}

function renderSlot(
  periodLabel: string,
  cursorMin: number,
  stepMin: number,
  rowPx: number,
  isPastDay: boolean,
  isToday: boolean,
  nowMinutes: number
) {
  const slotTime = minutesToTimeStr(cursorMin);
  const slotEnd = cursorMin + stepMin;
  const isPastSlot = isPastDay || (isToday && slotEnd <= nowMinutes);

  return (
    <div
      key={`slot-${cursorMin}`}
      className={`rounded-xl border px-2 flex items-center justify-between ${
        isPastSlot
          ? "border-slate-900/60 bg-slate-950/40 opacity-40"
          : "border-slate-800/50 bg-slate-950/30"
      }`}
      style={{ height: rowPx }}
      title={`${periodLabel} · ${slotTime}`}
    >
      <span className="text-[10px] text-slate-500">{slotTime}</span>
    </div>
  );
}

/** Normaliza formatos do backend */
function normalizeAppointments(list: any[]): ProviderAppointment[] {
  const items = list
    .map((raw) => {
      const id = String(raw?.id ?? "");
      if (!id) return null;

      const time =
        typeof raw?.time === "string"
          ? raw.time
          : raw?.startAt
          ? isoToTime(raw.startAt)
          : "00:00";

      const serviceName =
        typeof raw?.serviceName === "string"
          ? raw.serviceName
          : typeof raw?.service?.name === "string"
          ? raw.service.name
          : "Serviço";

      const customerName =
        typeof raw?.customerName === "string"
          ? raw.customerName
          : typeof raw?.clientName === "string"
          ? raw.clientName
          : typeof raw?.customer?.name === "string"
          ? raw.customer.name
          : "Cliente";

      const status = (raw?.status ?? "scheduled") as AppointmentStatus;

      const billingType =
        raw?.billingType === "plan" || raw?.billingType === "single"
          ? (raw.billingType as "plan" | "single")
          : undefined;

      const durationRaw =
        raw?.serviceDurationMin ??
        raw?.durationMin ??
        raw?.service?.durationMin ??
        30;

      const durationMin = Number(durationRaw);
      const durationSafe =
        Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 30;

      return {
        id,
        time,
        serviceName,
        customerName,
        status,
        billingType,
        durationMin: durationSafe,
      } as ProviderAppointment;
    })
    .filter(Boolean) as ProviderAppointment[];

  return items.sort(
    (a, b) => timeStrToMinutes(a.time) - timeStrToMinutes(b.time)
  );
}

function isoToTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function timeStrToMinutes(time: string): number {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr) || 0;
  const m = Number(mStr) || 0;
  return h * 60 + m;
}

function minutesToTimeStr(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDateYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekdayLabel(date: Date): string {
  const formatter = new Intl.DateTimeFormat("pt-PT", { weekday: "long" });
  const label = formatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function getStatusClasses(status: AppointmentStatus) {
  switch (status) {
    case "in_service":
      return {
        label: "Em atendimento",
        container: "border-emerald-500/40 bg-emerald-500/10",
        badge: "bg-emerald-500/30 text-emerald-100",
      };
    case "done":
      return {
        label: "Concluído",
        container: "border-slate-700 bg-slate-900",
        badge: "bg-slate-700 text-slate-100",
      };
    case "no_show":
      return {
        label: "Falta",
        container: "border-amber-500/40 bg-amber-500/10",
        badge: "bg-amber-500/30 text-amber-100",
      };
    case "cancelled":
      return {
        label: "Cancelado",
        container: "border-rose-500/40 bg-rose-500/10",
        badge: "bg-rose-500/30 text-rose-100",
      };
    default:
      return {
        label: "Agendado",
        container: "border-sky-500/40 bg-sky-500/10",
        badge: "bg-sky-500/30 text-sky-100",
      };
  }
}
