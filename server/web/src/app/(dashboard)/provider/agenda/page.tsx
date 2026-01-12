"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";

type ProviderMe = {
  id: string;
  name: string;
  specialty?: string | null;
  active?: boolean;
  locationId?: string | null;
};

type Appointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  clientName: string;
  clientPhone?: string | null;
  serviceName?: string | null;
  service?: { id: string; name: string; durationMin: number };
};

function toYYYYMMDD_UTC(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function hhmm(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

export default function ProviderAgendaPage() {
  const [provider, setProvider] = useState<ProviderMe | null>(null);
  const [date, setDate] = useState(() => toYYYYMMDD_UTC(new Date()));
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const titleDate = useMemo(() => {
    const d = new Date(date + "T00:00:00.000Z");
    return d.toLocaleDateString("pt-PT", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }, [date]);

  async function loadAppointments(meParam?: ProviderMe | null) {
    const me = meParam ?? provider;
    if (!me) return;

    const qs = new URLSearchParams();
    qs.set("date", date);
    qs.set("providerId", me.id);
    if (me.locationId) qs.set("locationId", me.locationId);

    const appts = await apiClient<Appointment[]>(
      `/appointments?${qs.toString()}`
    );

    setItems(appts);
  }

  async function handleSetStatus(
    appointmentId: string,
    status: "done" | "no_show"
  ) {
    try {
      setError(null);

      await apiClient(`/appointments/${appointmentId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      await loadAppointments();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao atualizar status.");
    }
  }

  async function handleCancel(appointmentId: string) {
    try {
      setError(null);

      await apiClient(`/appointments/${appointmentId}`, {
        method: "DELETE",
      });

      await loadAppointments();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao cancelar agendamento.");
    }
  }

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const me = await apiClient<ProviderMe>("/providers/me");
        if (!alive) return;

        setProvider(me);

        await loadAppointments(me);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Erro ao carregar agenda.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [date]);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Agenda</h1>
          <p className="mt-1 text-sm text-slate-400">
            {provider ? (
              <>
                Profissional:{" "}
                <span className="text-slate-200">{provider.name}</span> —{" "}
                <span className="text-slate-200">{titleDate}</span>
              </>
            ) : (
              <>Carregando profissional…</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Dia</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {loading && (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-sm text-slate-300">
          Carregando agenda…
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-rose-900/60 bg-rose-950/20 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="mt-6 space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
            <p className="text-sm text-slate-300">
              Atendimentos:{" "}
              <span className="text-slate-100 font-medium">{items.length}</span>
            </p>
          </div>

          {items.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-sm text-slate-400">
              Nenhum atendimento nesse dia.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 text-sm text-slate-200 font-medium">
                Lista
              </div>

              <div className="divide-y divide-slate-800">
                {items.map((a) => (
                  <div
                    key={a.id}
                    className="px-4 py-3 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-slate-100 font-medium truncate">
                        {a.serviceName ?? a.service?.name ?? "Serviço"}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {a.clientName} • {hhmm(a.startAt)} - {hhmm(a.endAt)} •
                        status: {a.status}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSetStatus(a.id, "done")}
                        className="rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 hover:border-emerald-500"
                      >
                        Done
                      </button>

                      <button
                        onClick={() => handleSetStatus(a.id, "no_show")}
                        className="rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 hover:border-amber-500"
                      >
                        No-show
                      </button>

                      <button
                        onClick={() => handleCancel(a.id)}
                        className="rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-rose-200 hover:border-rose-500"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
