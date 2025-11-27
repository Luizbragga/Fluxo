// src/app/(dashboard)/owner/_api/owner-agenda.ts
import { apiClient } from "@/lib/api-client";

export type AgendaProfessional = {
  id: string;
  name: string;
};

export type AgendaAppointmentStatus =
  | "scheduled"
  | "in_service"
  | "done"
  | "no_show"
  | "cancelled";

export type AgendaAppointment = {
  id: string;
  professionalId: string;
  time: string; // "09:00"
  customerName: string;
  serviceName: string;
  status: AgendaAppointmentStatus;
};

// Shape aproximado do que o Nest devolve em /appointments
type BackendAppointment = {
  id: string;
  providerId: string;
  startAt: string;
  status: AgendaAppointmentStatus;
  clientName: string | null;
  serviceName: string | null;
  provider?: {
    id: string;
    name: string;
  } | null;
  service?: {
    id: string;
    name: string;
    durationMin: number;
  } | null;
};

export type OwnerAgendaDay = {
  professionals: AgendaProfessional[];
  appointments: AgendaAppointment[];
};

/**
 * Busca a agenda do dia (de TODO o tenant) e agrupa:
 * - lista de profissionais
 * - lista de appointments já no formato da tela
 */
export async function fetchOwnerAgendaDay(
  dateYYYYMMDD: string
): Promise<OwnerAgendaDay> {
  const data = await apiClient<BackendAppointment[]>(
    `/appointments?date=${encodeURIComponent(dateYYYYMMDD)}`,
    { method: "GET" }
  );

  const professionalsMap = new Map<string, AgendaProfessional>();

  const appointments: AgendaAppointment[] = data.map((appt) => {
    const providerId = appt.provider?.id ?? appt.providerId;
    const providerName = appt.provider?.name ?? "Profissional";

    if (providerId && !professionalsMap.has(providerId)) {
      professionalsMap.set(providerId, {
        id: providerId,
        name: providerName,
      });
    }

    const start = new Date(appt.startAt);
    const hours = String(start.getHours()).padStart(2, "0");
    const minutes = String(start.getMinutes()).padStart(2, "0");

    return {
      id: appt.id,
      professionalId: providerId,
      time: `${hours}:${minutes}`,
      customerName: appt.clientName ?? "Cliente",
      serviceName: appt.serviceName ?? appt.service?.name ?? "Serviço",
      status: appt.status,
    };
  });

  const professionals = Array.from(professionalsMap.values());

  return { professionals, appointments };
}

/**
 * Atualiza o status de um appointment.
 * Usa o PATCH /v1/appointments/:id com { status }.
 */
export async function updateAppointmentStatus(
  appointmentId: string,
  status: AgendaAppointmentStatus
): Promise<void> {
  await apiClient(`/appointments/${appointmentId}`, {
    method: "PATCH",
    body: { status },
  });
}
