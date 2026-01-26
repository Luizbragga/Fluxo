"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import {
  fetchPublicBookingData,
  PublicBookingData,
} from "../_api/public-booking";
import {
  fetchPublicDayAppointments,
  PublicAppointment,
} from "../_api/public-availability";

function formatDateYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export default function BookPage() {
  const params = useParams();
  const locationId = (params as any)?.locationId as string | undefined;

  const [data, setData] = useState<PublicBookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Step 1 selections
  const [serviceId, setServiceId] = useState<string>("");
  const [providerId, setProviderId] = useState<string>("");

  // disponibilidade
  const [dayAppts, setDayAppts] = useState<PublicAppointment[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const selectedDateStr = useMemo(
    () => formatDateYYYYMMDD(selectedDate),
    [selectedDate],
  );
  const maxDateStr = useMemo(
    () => formatDateYYYYMMDD(addDays(today, 30)),
    [today],
  );

  // bookingStepMin SEMPRE definido (mesmo sem data)
  const bookingStepMin = useMemo(() => {
    const raw = data?.location?.bookingIntervalMin ?? 30;
    const allowed = [5, 10, 15, 20, 30, 45, 60] as const;
    return (allowed as readonly number[]).includes(raw) ? raw : 30;
  }, [data?.location?.bookingIntervalMin]);

  // slots do dia (mesmo sem data -> [])
  const daySlots = useMemo(() => {
    const template = data?.location?.businessHoursTemplate;
    if (!template) return [];

    const weekdayKey = getWeekdayKeyLocal(selectedDate);
    const raw = template[weekdayKey] ?? [];
    const intervals = normalizeIntervals(raw);
    return buildSlotsFromIntervals(intervals, bookingStepMin);
  }, [data?.location?.businessHoursTemplate, selectedDate, bookingStepMin]);

  // isToday + nowMinutes (para bloquear horários passados)
  const isToday = useMemo(() => {
    const now = new Date();
    return formatDateYYYYMMDD(now) === selectedDateStr;
  }, [selectedDateStr]);

  const nowMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);

  // calcula slots ocupados baseado nos appointments
  const occupiedSlots = useMemo(() => {
    const ranges = (dayAppts ?? [])
      .filter((a) => a.status !== "cancelled")
      .map((a) => {
        const s = new Date(a.startAt);
        const e = new Date(a.endAt);
        return {
          startMin: s.getHours() * 60 + s.getMinutes(),
          endMin: e.getHours() * 60 + e.getMinutes(),
        };
      });

    const set = new Set<string>();

    for (const slot of daySlots) {
      const sMin = timeStrToMinutes(slot);
      const eMin = sMin + bookingStepMin;

      if (ranges.some((r) => overlaps(sMin, eMin, r.startMin, r.endMin))) {
        set.add(slot);
      }
    }

    return set;
  }, [dayAppts, daySlots, bookingStepMin]);

  // 1) Carrega dados públicos da location
  useEffect(() => {
    let alive = true;

    async function load() {
      if (!locationId) return;

      try {
        setLoading(true);
        setError(null);

        const res = await fetchPublicBookingData(locationId);
        if (!alive) return;

        setData(res);

        // defaults (serviço/profissional)
        const firstServiceId = res.services?.[0]?.id ?? "";
        const firstProviderId = res.providers?.[0]?.id ?? "";

        setServiceId((prev) => prev || firstServiceId);
        setProviderId((prev) => prev || firstProviderId);
      } catch (err: any) {
        const msg =
          err instanceof ApiError
            ? err.message
            : "Erro ao carregar agendamento.";
        if (!alive) return;
        setError(msg);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [locationId]);

  // 2) quando mudar serviço/profissional/dia, reseta horário selecionado
  useEffect(() => {
    setSelectedTime(null);
  }, [serviceId, providerId, selectedDateStr]);

  // 3) carrega appointments do dia (público) para bloquear horários
  useEffect(() => {
    let alive = true;

    async function loadDay() {
      if (!data?.location?.id) return;
      if (!providerId) return;

      try {
        setSlotsLoading(true);

        const list = await fetchPublicDayAppointments({
          locationId: data.location.id,
          providerId,
          date: selectedDateStr,
        });

        if (!alive) return;
        setDayAppts(Array.isArray(list) ? list : []);
      } catch (err) {
        console.warn("Falha ao carregar disponibilidade pública:", err);
        if (!alive) return;
        setDayAppts([]);
      } finally {
        if (alive) setSlotsLoading(false);
      }
    }

    loadDay();
    return () => {
      alive = false;
    };
  }, [data?.location?.id, providerId, selectedDateStr]);

  // -------- RENDER --------

  const locationName = data?.location?.name ?? "Agendamento online";

  const services = data?.services ?? [];
  const providers = data?.providers ?? [];

  const selectedServiceName =
    services.find((s) => s.id === serviceId)?.name ?? "-";
  const selectedProviderName =
    providers.find((p) => p.id === providerId)?.name ?? "-";

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-sm text-slate-400">Carregando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-rose-300">
          {error}
        </div>
      </div>
    );
  }

  // se não veio data, mostra erro amigável (mas SEM quebrar hooks)
  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
          Não foi possível carregar os dados de agendamento.
        </div>
      </div>
    );
  }

  const noProviders = providers.length === 0;
  const noServices = services.length === 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">
          Agendamento online
        </p>

        <h1 className="text-xl font-semibold mt-1">{locationName}</h1>

        <p className="text-xs text-slate-400 mt-1">
          Escolha serviço, profissional e dia. Depois escolhe o horário.
        </p>

        <div className="mt-5 space-y-4">
          {/* Serviço */}
          <div>
            <p className="text-[11px] text-slate-400 mb-1">Serviço</p>

            {noServices ? (
              <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                Nenhum serviço disponível para agendamento.
              </div>
            ) : (
              <select
                className="w-full rounded-md bg-slate-900/60 border border-slate-700 px-2 py-2 text-[13px] text-slate-100 outline-none focus:border-emerald-500"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.durationMin} min
                    {typeof s.priceCents === "number"
                      ? ` · €${(s.priceCents / 100).toFixed(2)}`
                      : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Profissional */}
          <div>
            <p className="text-[11px] text-slate-400 mb-1">Profissional</p>

            {noProviders ? (
              <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                Nenhum profissional disponível para agendamento.
              </div>
            ) : (
              <select
                className="w-full rounded-md bg-slate-900/60 border border-slate-700 px-2 py-2 text-[13px] text-slate-100 outline-none focus:border-emerald-500"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Data */}
          <div>
            <p className="text-[11px] text-slate-400 mb-1">Dia</p>
            <input
              type="date"
              className="w-full rounded-md bg-slate-900/60 border border-slate-700 px-2 py-2 text-[13px] text-slate-100 outline-none focus:border-emerald-500"
              value={selectedDateStr}
              max={maxDateStr}
              onChange={(e) => {
                if (!e.target.value) return;
                const [y, m, d] = e.target.value.split("-").map(Number);
                setSelectedDate(new Date(y, m - 1, d, 0, 0, 0, 0));
              }}
            />
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300">
            <p className="text-[11px] text-slate-500 mb-1">Seleção atual</p>
            <p>
              Serviço:{" "}
              <span className="text-slate-100">{selectedServiceName}</span>
            </p>
            <p>
              Profissional:{" "}
              <span className="text-slate-100">{selectedProviderName}</span>
            </p>
            <p>
              Dia: <span className="text-slate-100">{selectedDateStr}</span>
            </p>
          </div>

          {/* Horários */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Horários disponíveis
              </p>

              {slotsLoading && (
                <span className="text-[11px] text-slate-500">
                  Carregando...
                </span>
              )}
            </div>

            {noProviders || noServices ? (
              <p className="text-xs text-slate-400">
                Selecione um serviço e um profissional para ver horários.
              </p>
            ) : daySlots.length === 0 ? (
              <p className="text-xs text-slate-400">
                Sem horários configurados para este dia.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {daySlots.map((t) => {
                  const sMin = timeStrToMinutes(t);
                  const eMin = sMin + bookingStepMin;

                  const past = isToday && eMin <= nowMinutes;
                  const busy = occupiedSlots.has(t);
                  const active = selectedTime === t;

                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={past || busy}
                      onClick={() => setSelectedTime(t)}
                      className={[
                        "px-2 py-2 rounded-lg border text-[12px] transition-colors",
                        active
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-100"
                          : "border-slate-800 bg-slate-900/40 text-slate-100 hover:bg-slate-900/60",
                        past || busy
                          ? "opacity-40 cursor-not-allowed hover:bg-slate-900/40"
                          : "",
                      ].join(" ")}
                      title={
                        busy
                          ? "Indisponível"
                          : past
                            ? "Horário já passou"
                            : "Selecionar horário"
                      }
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            )}

            {selectedTime && (
              <p className="mt-3 text-xs text-slate-300">
                Horário selecionado:{" "}
                <span className="text-slate-100 font-semibold">
                  {selectedTime}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

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

type DayInterval = { start: string; end: string };

function getWeekdayKeyLocal(date: Date) {
  const keyMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  return keyMap[date.getDay()];
}

function normalizeIntervals(raw: any): DayInterval[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it) => {
      if (!Array.isArray(it) || it.length < 2) return null;
      const [start, end] = it;
      if (typeof start !== "string" || typeof end !== "string") return null;
      return { start, end };
    })
    .filter(Boolean) as DayInterval[];
}

function buildSlotsFromIntervals(intervals: DayInterval[], stepMin: number) {
  const out: string[] = [];

  for (const itv of intervals) {
    const startMin = timeStrToMinutes(itv.start);
    const endMin = timeStrToMinutes(itv.end);

    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) continue;
    if (endMin <= startMin) continue;

    for (let m = startMin; m <= endMin; m += stepMin) {
      if (m > endMin) break;
      out.push(minutesToTimeStr(m));
    }
  }

  return Array.from(new Set(out)).sort();
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}
