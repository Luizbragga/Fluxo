// src/app/(dashboard)/owner/_api/owner-agenda.ts
import { apiClient } from "@/lib/api-client";

export type AgendaProfessional = {
  id: string;
  name: string;
  locationId?: string | null;
  locationName?: string | null;
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

  // horário de início (para exibir no card)
  time: string; // "09:00"

  customerName: string;
  serviceName: string;
  status: AgendaAppointmentStatus;

  // duração real do serviço
  durationMin: number;

  // intervalo em minutos desde 00:00 (para saber quantos slots ocupa)
  startMinutes: number; // ex.: 14:00 -> 14*60 = 840
  endMinutes: number; // startMinutes + durationMin

  // Se veio de plano ou avulso
  billingType: "plan" | "avulso";
  servicePriceCents: number;
};

// Shape aproximado do que o Nest devolve em /appointments
type BackendAppointment = {
  id: string;
  providerId: string;
  startAt: string;
  status: AgendaAppointmentStatus;
  clientName: string | null;
  serviceName: string | null;

  // Duração já gravada no appointment
  serviceDurationMin?: number | null;

  // Se está ligado a um plano
  customerPlanId?: string | null;

  provider?: BackendProvider | null;
  service?: {
    id: string;
    name: string;
    durationMin: number;
    priceCents?: number | null;
    servicePriceCents?: number | null;
  } | null;
};

type BackendProvider = {
  id: string;
  name: string;
  locationId?: string | null;
  locationName?: string | null;
  location?: {
    id: string;
    name: string;
    slug?: string | null;
  } | null;
};

export type OwnerAgendaDay = {
  professionals: AgendaProfessional[];
  appointments: AgendaAppointment[];
};

function mapProviderToAgendaProfessional(
  provider: BackendProvider
): AgendaProfessional {
  const locationId = provider.locationId ?? provider.location?.id ?? null;

  const locationName =
    provider.locationName ??
    provider.location?.name ??
    provider.location?.slug ??
    null;

  return {
    id: provider.id,
    name: provider.name,
    locationId,
    locationName,
  };
}

/**
 * Busca a agenda do dia (de TODO o tenant) e agrupa:
 * - lista de profissionais
 * - lista de appointments já no formato da tela
 */
type OwnerAgendaDayParams = {
  locationId?: string;
};

export async function fetchOwnerAgendaDay(
  dateYYYYMMDD: string,
  params?: OwnerAgendaDayParams
): Promise<OwnerAgendaDay> {
  const qs = new URLSearchParams();
  qs.set("date", dateYYYYMMDD);
  if (params?.locationId) qs.set("locationId", params.locationId);

  const [appointmentsData, providersResponse] = await Promise.all([
    apiClient<BackendAppointment[]>(`/appointments?${qs.toString()}`, {
      method: "GET",
    }),
    apiClient<any>(
      params?.locationId
        ? `/providers?locationId=${encodeURIComponent(params.locationId)}`
        : "/providers",
      { method: "GET" }
    ),
  ]);

  // ------------------------------------------------------------------
  // Normaliza a resposta de /providers para um array de { id, name, locationId, locationName }
  // ------------------------------------------------------------------
  let providersArray: BackendProvider[] = [];

  if (Array.isArray(providersResponse)) {
    // caso simples: [ { id, name, ... }, ... ]
    providersArray = providersResponse as BackendProvider[];
  } else if (providersResponse && typeof providersResponse === "object") {
    // tenta achar alguma propriedade que seja um array de objetos com id/name
    for (const value of Object.values(providersResponse)) {
      if (
        Array.isArray(value) &&
        value.length > 0 &&
        typeof value[0] === "object" &&
        value[0] !== null &&
        "id" in value[0] &&
        "name" in value[0]
      ) {
        providersArray = value as BackendProvider[];
        break;
      }
    }
  }

  const professionalsMap = new Map<string, AgendaProfessional>();

  // adiciona todos providers como profissionais base da agenda
  for (const provider of providersArray) {
    if (!provider || !provider.id) continue;

    if (!professionalsMap.has(provider.id)) {
      professionalsMap.set(
        provider.id,
        mapProviderToAgendaProfessional(provider)
      );
    }
  }

  // ------------------------------------------------------------------
  // Mapeia appointments -> formato de tela
  // ------------------------------------------------------------------
  const appointments: AgendaAppointment[] = appointmentsData.map((appt) => {
    const provider = appt.provider as BackendProvider | undefined | null;

    const providerId = provider?.id ?? appt.providerId;
    const providerName = provider?.name ?? "Profissional";

    // garante que o provider do appointment também está no mapa
    if (providerId && !professionalsMap.has(providerId)) {
      professionalsMap.set(
        providerId,
        mapProviderToAgendaProfessional(
          provider ?? { id: providerId, name: providerName }
        )
      );
    }

    const start = new Date(appt.startAt);

    // horas/minutos reais de início
    const hours = start.getHours();
    const minutes = start.getMinutes();
    const timeLabel = `${String(hours).padStart(2, "0")}:${String(
      minutes
    ).padStart(2, "0")}`;

    // minutos desde meia-noite
    const startMinutes = hours * 60 + minutes;

    // duração do serviço (usa valor do appointment se existir)
    const durationMin =
      appt.serviceDurationMin ?? appt.service?.durationMin ?? 30;
    const servicePriceCents =
      appt.servicePriceCents ?? appt.service?.priceCents ?? 0;

    // fim em minutos desde meia-noite
    const endMinutes = startMinutes + durationMin;

    // NOVO: se tem customerPlanId -> plano, senão avulso
    const billingType: "plan" | "avulso" = appt.customerPlanId
      ? "plan"
      : "avulso";

    return {
      id: appt.id,
      professionalId: providerId,
      time: timeLabel,
      customerName: appt.clientName ?? "Cliente",
      serviceName: appt.serviceName ?? appt.service?.name ?? "Serviço",
      status: appt.status,
      durationMin,
      startMinutes,
      endMinutes,
      billingType,
      servicePriceCents,
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
