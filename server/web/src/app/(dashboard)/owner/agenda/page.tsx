"use client";

import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/use-auth";
import {
  fetchOwnerAgendaDay,
  updateAppointmentStatus,
  type AgendaProfessional,
  type AgendaAppointment,
} from "../_api/owner-agenda";

type FilterProfessionalId = string | "all";

const timeSlots = [
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
  "20:30",
];

export default function OwnerAgendaPage() {
  // Protege a rota: só owner logado entra
  const { user, loading: authLoading } = useRequireAuth({
    requiredRole: "owner",
  });

  const [currentDate] = useState<Date>(new Date());
  const [professionals, setProfessionals] = useState<AgendaProfessional[]>([]);
  const [appointments, setAppointments] = useState<AgendaAppointment[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] =
    useState<FilterProfessionalId>("all");
  const [loadingAgenda, setLoadingAgenda] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAgenda() {
      if (authLoading) return;
      if (!user) return; // o hook já redireciona se não tiver user

      try {
        setLoadingAgenda(true);
        setError(null);

        const dateStr = formatDateYYYYMMDD(currentDate);
        const data = await fetchOwnerAgendaDay(dateStr);

        setProfessionals(data.professionals);
        setAppointments(data.appointments);
      } catch (err) {
        console.error("Erro ao carregar agenda do owner:", err);
        setError("Erro ao carregar a agenda do dia.");
      } finally {
        setLoadingAgenda(false);
      }
    }

    loadAgenda();
  }, [authLoading, user, currentDate]);

  // Handler: clique no card para avançar o status
  async function handleChangeStatus(
    appointmentId: string,
    currentStatus: AgendaAppointment["status"]
  ) {
    const nextStatus = getNextStatusForClick(currentStatus);

    // nada a fazer (done / no_show / cancelled)
    if (!nextStatus || nextStatus === currentStatus) {
      return;
    }

    try {
      setError(null);

      // otimista: atualiza na tela antes
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === appointmentId ? { ...a, status: nextStatus } : a
        )
      );

      await updateAppointmentStatus(appointmentId, nextStatus);
    } catch (err) {
      console.error("Erro ao atualizar status do agendamento:", err);
      setError("Não foi possível atualizar o status do agendamento.");

      // rollback
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === appointmentId ? { ...a, status: currentStatus } : a
        )
      );
    }
  }

  const visibleProfessionals =
    selectedProfessionalId === "all"
      ? professionals
      : professionals.filter((pro) => pro.id === selectedProfessionalId);

  const weekdayLabel = getWeekdayLabel(currentDate);

  if (authLoading || loadingAgenda) {
    return (
      <div className="text-sm text-slate-400">Carregando agenda do dia...</div>
    );
  }

  if (error) {
    return <div className="text-sm text-rose-400">{error}</div>;
  }

  if (!professionals.length) {
    return (
      <>
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-lg font-semibold">Agenda</h1>
            <p className="text-xs text-slate-400">
              Visão diária por profissional.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <button className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900/80">
              Hoje · {weekdayLabel}
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400">
          Nenhum agendamento encontrado para hoje.
        </section>
      </>
    );
  }

  return (
    <>
      {/* Cabeçalho da página */}
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Agenda</h1>
          <p className="text-xs text-slate-400">
            Visão diária por profissional. Depois vamos ligar filtros reais de
            unidade e data.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900/80">
            Hoje · {weekdayLabel}
          </button>
          <select className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200">
            <option>Unidade atual do tenant</option>
          </select>
          <select
            className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200"
            value={selectedProfessionalId}
            onChange={(e) =>
              setSelectedProfessionalId(
                (e.target.value || "all") as FilterProfessionalId
              )
            }
          >
            <option value="all">Todos os profissionais</option>
            {professionals.map((pro) => (
              <option key={pro.id} value={pro.id}>
                {pro.name}
              </option>
            ))}
          </select>
          <div className="flex rounded-lg border border-slate-800 bg-slate-900/80 overflow-hidden">
            <button className="px-3 py-1 text-slate-50 bg-slate-800 text-[11px]">
              Diário
            </button>
            <button className="px-3 py-1 text-slate-400 text-[11px]">
              Semanal
            </button>
          </div>
        </div>
      </header>

      {/* Grid da agenda diária */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="grid grid-cols-[80px_repeat(3,minmax(0,1fr))] gap-2 text-xs">
          {/* Cabeçalho de colunas */}
          <div />
          {visibleProfessionals.map((pro) => (
            <div
              key={pro.id}
              className="px-2 py-1 rounded-lg bg-slate-950/50 border border-slate-800/80 font-medium"
            >
              {pro.name}
            </div>
          ))}

          {/* Linhas de horários */}
          {timeSlots.map((slot) => (
            <RowTimeSlot
              key={slot}
              slot={slot}
              professionals={visibleProfessionals}
              appointments={appointments}
              onChangeStatus={handleChangeStatus}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function RowTimeSlot({
  slot,
  professionals,
  appointments,
  onChangeStatus,
}: {
  slot: string;
  professionals: AgendaProfessional[];
  appointments: AgendaAppointment[];
  onChangeStatus?: (
    appointmentId: string,
    currentStatus: AgendaAppointment["status"]
  ) => void;
}) {
  return (
    <>
      {/* Coluna de horário */}
      <div className="flex items-start justify-end pr-1 pt-2 text-[10px] text-slate-500">
        {slot}
      </div>

      {/* Colunas por profissional */}
      {professionals.map((pro) => {
        const appt = appointments.find(
          (a) => a.professionalId === pro.id && a.time === slot
        );

        if (!appt) {
          return (
            <div
              key={pro.id}
              className="h-14 rounded-xl border border-slate-800/50 bg-slate-950/30"
            />
          );
        }

        const statusStyles = getStatusClasses(appt.status);

        return (
          <div
            key={pro.id}
            className={`h-14 rounded-xl border px-2 py-1 flex flex-col justify-between cursor-pointer ${statusStyles.container}`}
            onClick={() => onChangeStatus?.(appt.id, appt.status)}
          >
            <p className="text-[11px] font-medium">{appt.serviceName}</p>
            <p className="text-[10px] text-slate-300">{appt.customerName}</p>
            <span
              className={`self-start text-[9px] px-1 rounded ${statusStyles.badge}`}
            >
              {statusStyles.label}
            </span>
          </div>
        );
      })}
    </>
  );
}

function getStatusClasses(status: AgendaAppointment["status"]) {
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

function getNextStatusForClick(
  status: AgendaAppointment["status"]
): AgendaAppointment["status"] | null {
  switch (status) {
    case "scheduled":
      return "in_service";
    case "in_service":
      return "done";
    default:
      // done, no_show, cancelled -> não mudam via clique simples
      return null;
  }
}

function formatDateYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekdayLabel(date: Date): string {
  const formatter = new Intl.DateTimeFormat("pt-PT", { weekday: "long" });
  const label = formatter.format(date); // ex: "terça-feira"
  // Capitaliza primeira letra
  return label.charAt(0).toUpperCase() + label.slice(1);
}
