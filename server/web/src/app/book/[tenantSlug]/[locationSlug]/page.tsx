"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import {
  fetchPublicBookingDataBySlug,
  PublicBookingData,
} from "../../_api/public-booking";
import {
  fetchPublicDayAppointments,
  PublicAppointment,
} from "../../_api/public-availability";
import { createPublicAppointmentBySlug } from "../../../book/_api/public-create-appointment";

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

export default function BookBySlugPage() {
  const params = useParams();
  const tenantSlug = (params as any)?.tenantSlug as string | undefined;
  const locationSlug = (params as any)?.locationSlug as string | undefined;

  const [data, setData] = useState<PublicBookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState<string>("");
  const [providerId, setProviderId] = useState<string>("");

  const [dayAppts, setDayAppts] = useState<PublicAppointment[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [noAvailabilityMsg, setNoAvailabilityMsg] = useState<string | null>(
    null,
  );

  // ✅ dados do cliente + submit
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);

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

  const services = data?.services ?? [];
  const providers = data?.providers ?? [];

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  const selectedServiceDurationMin = useMemo(() => {
    const raw = selectedService?.durationMin ?? 30;
    return Number.isFinite(raw) && raw > 0 ? raw : 30;
  }, [selectedService?.durationMin]);

  const bookingStepMin = useMemo(() => {
    const raw = data?.location?.bookingIntervalMin ?? 30;
    const allowed = [5, 10, 15, 20, 30, 45, 60] as const;
    return (allowed as readonly number[]).includes(raw) ? raw : 30;
  }, [data?.location?.bookingIntervalMin]);

  const getDaySlotsForDate = (date: Date) => {
    const template = data?.location?.businessHoursTemplate;
    if (!template) return [];

    const weekdayKey = getWeekdayKeyLocal(date);
    const raw = template[weekdayKey] ?? [];
    const intervals = normalizeIntervals(raw);

    return buildSlotsFromIntervals(
      intervals,
      bookingStepMin,
      selectedServiceDurationMin,
    );
  };

  const isToday = useMemo(() => {
    const now = new Date();
    return formatDateYYYYMMDD(now) === selectedDateStr;
  }, [selectedDateStr]);

  const nowMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);

  const busyRanges = useMemo(() => {
    return (dayAppts ?? [])
      .filter((a) => a.status !== "cancelled")
      .map((a) => {
        const s = new Date(a.startAt);
        const e = new Date(a.endAt);
        return {
          startMin: s.getHours() * 60 + s.getMinutes(),
          endMin: e.getHours() * 60 + e.getMinutes(),
        };
      });
  }, [dayAppts]);

  const daySlots = useMemo(() => {
    return getDaySlotsForDate(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data?.location?.businessHoursTemplate,
    selectedDateStr,
    bookingStepMin,
    selectedServiceDurationMin,
  ]);

  const availableSlots = useMemo(() => {
    return daySlots.filter((t) => {
      const sMin = timeStrToMinutes(t);
      const eMin = sMin + selectedServiceDurationMin;

      if (isToday && eMin <= nowMinutes) return false;

      const busy = busyRanges.some((r) =>
        overlaps(sMin, eMin, r.startMin, r.endMin),
      );
      if (busy) return false;

      return true;
    });
  }, [daySlots, busyRanges, isToday, nowMinutes, selectedServiceDurationMin]);

  // load by slug
  useEffect(() => {
    let alive = true;

    async function load() {
      if (!tenantSlug || !locationSlug) return;

      try {
        setLoading(true);
        setError(null);

        const res = await fetchPublicBookingDataBySlug({
          tenantSlug,
          locationSlug,
        });

        if (!alive) return;

        setData(res);

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
  }, [tenantSlug, locationSlug]);

  useEffect(() => {
    setSelectedTime(null);
    setSubmitOk(null);
    setSubmitError(null);
  }, [serviceId, providerId, selectedDateStr]);

  useEffect(() => {
    let alive = true;

    async function loadDayAndMaybeJump() {
      if (!data?.location?.id) return;
      if (!providerId) return;

      try {
        setSlotsLoading(true);
        setNoAvailabilityMsg(null);

        const horizonDays = 30;

        for (let i = 0; i <= horizonDays; i++) {
          if (!alive) return;

          const candidateDate = addDays(selectedDate, i);
          const candidateStr = formatDateYYYYMMDD(candidateDate);

          const slots = getDaySlotsForDate(candidateDate);
          if (slots.length === 0) continue;

          const appts = await fetchPublicDayAppointments({
            tenantSlug: tenantSlug!,
            locationSlug: locationSlug!,
            providerId,
            date: candidateStr,
          });

          if (!alive) return;

          const ranges = (appts ?? [])
            .filter((a) => a.status !== "cancelled")
            .map((a) => {
              const s = new Date(a.startAt);
              const e = new Date(a.endAt);
              return {
                startMin: s.getHours() * 60 + s.getMinutes(),
                endMin: e.getHours() * 60 + e.getMinutes(),
              };
            });

          const now = new Date();
          const isTodayCandidate = formatDateYYYYMMDD(now) === candidateStr;
          const nowMin = now.getHours() * 60 + now.getMinutes();

          const filtered = slots.filter((t) => {
            const sMin = timeStrToMinutes(t);
            const eMin = sMin + selectedServiceDurationMin;

            if (isTodayCandidate && eMin <= nowMin) return false;

            const busy = ranges.some((r) =>
              overlaps(sMin, eMin, r.startMin, r.endMin),
            );
            if (busy) return false;

            return true;
          });

          if (filtered.length > 0) {
            if (candidateStr !== selectedDateStr) {
              setSelectedDate(candidateDate);
            }
            setDayAppts(Array.isArray(appts) ? appts : []);
            return;
          }
        }

        setNoAvailabilityMsg("Sem horários disponíveis nos próximos 30 dias.");
        setDayAppts([]);
      } catch (err) {
        console.warn("Falha ao carregar disponibilidade pública:", err);
        if (!alive) return;
        setNoAvailabilityMsg("Falha ao carregar disponibilidade.");
        setDayAppts([]);
      } finally {
        if (alive) setSlotsLoading(false);
      }
    }

    loadDayAndMaybeJump();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data?.location?.id,
    providerId,
    selectedDateStr,
    bookingStepMin,
    selectedServiceDurationMin,
  ]);

  async function handleConfirm() {
    if (!tenantSlug || !locationSlug) return;

    setSubmitOk(null);
    setSubmitError(null);

    if (!serviceId || !providerId || !selectedTime) {
      setSubmitError("Selecione serviço, profissional e horário.");
      return;
    }

    const name = customerName.trim();
    const phone = customerPhone.trim();

    if (!name || !phone) {
      setSubmitError("Informe nome e telefone.");
      return;
    }

    try {
      setSubmitting(true);

      await createPublicAppointmentBySlug({
        tenantSlug,
        locationSlug,
        payload: {
          serviceId,
          providerId,
          date: selectedDateStr,
          time: selectedTime,
          customerName: name,
          customerPhone: phone,
        },
      });

      setSubmitOk("Agendamento confirmado!");
      setSelectedTime(null);

      const appts = await fetchPublicDayAppointments({
        tenantSlug: tenantSlug!,
        locationSlug: locationSlug!,
        providerId,
        date: selectedDateStr,
      });

      setDayAppts(Array.isArray(appts) ? appts : []);
    } catch (err: any) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Erro ao confirmar agendamento.";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const locationName = data?.location?.name ?? "Agendamento online";
  const selectedServiceName = selectedService?.name ?? "-";
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
            ) : noAvailabilityMsg ? (
              <p className="text-xs text-rose-200">{noAvailabilityMsg}</p>
            ) : availableSlots.length === 0 ? (
              <p className="text-xs text-slate-400">
                Sem horários disponíveis.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {availableSlots.map((t) => {
                  const active = selectedTime === t;

                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedTime(t)}
                      className={[
                        "px-2 py-2 rounded-lg border text-[12px] transition-colors",
                        active
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-100"
                          : "border-slate-800 bg-slate-900/40 text-slate-100 hover:bg-slate-900/60",
                      ].join(" ")}
                      title="Selecionar horário"
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

          {/* ✅ DADOS DO CLIENTE + CONFIRMAR */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3 space-y-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Confirmar agendamento
            </p>

            <div>
              <p className="text-[11px] text-slate-400 mb-1">Nome</p>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-md bg-slate-900/60 border border-slate-700 px-2 py-2 text-[13px] text-slate-100 outline-none focus:border-emerald-500"
                placeholder="Ex: João Silva"
              />
            </div>

            <div>
              <p className="text-[11px] text-slate-400 mb-1">Telefone</p>
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full rounded-md bg-slate-900/60 border border-slate-700 px-2 py-2 text-[13px] text-slate-100 outline-none focus:border-emerald-500"
                placeholder="Ex: +351 9xx xxx xxx"
              />
            </div>

            {submitError && (
              <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {submitError}
              </div>
            )}

            {submitOk && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                {submitOk}
              </div>
            )}

            <button
              type="button"
              disabled={submitting || !selectedTime}
              onClick={handleConfirm}
              className={[
                "w-full rounded-lg px-3 py-2 text-sm font-semibold border transition-colors",
                submitting || !selectedTime
                  ? "border-slate-800 bg-slate-900/40 text-slate-500 cursor-not-allowed"
                  : "border-emerald-500 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25",
              ].join(" ")}
            >
              {submitting ? "Confirmando..." : "Confirmar agendamento"}
            </button>

            {!selectedTime && (
              <p className="text-[11px] text-slate-500">
                Selecione um horário para habilitar o botão.
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

function buildSlotsFromIntervals(
  intervals: DayInterval[],
  stepMin: number,
  serviceDurationMin: number,
) {
  const out: string[] = [];

  for (const itv of intervals) {
    const startMin = timeStrToMinutes(itv.start);
    const endMin = timeStrToMinutes(itv.end);

    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) continue;
    if (endMin <= startMin) continue;

    for (let m = startMin; m + serviceDurationMin <= endMin; m += stepMin) {
      out.push(minutesToTimeStr(m));
    }
  }

  return Array.from(new Set(out)).sort();
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}
