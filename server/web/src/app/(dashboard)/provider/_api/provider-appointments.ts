// server/web/src/app/(dashboard)/provider/_api/provider-appointments.ts
import { apiClient, ApiError } from "@/lib/api-client";

export type ProviderBackendAppointment = {
  id: string;
  providerId: string;
  startAt: string;
  endAt?: string;
  status: "scheduled" | "in_service" | "done" | "no_show" | "cancelled";
  clientName: string | null;
  clientPhone?: string | null;
  serviceName: string | null;
  service?: {
    id: string;
    name: string;
    durationMin: number;
  } | null;
  provider?: {
    id: string;
    name: string;
  } | null;
};

export type CreateProviderAppointmentInput = {
  // OBS: backend já FORÇA providerId quando role=provider,
  // mas a gente manda mesmo assim para manter compatibilidade
  providerId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  clientName: string;
  clientPhone: string;

  // opcional: se o provider também puder agendar via plano no futuro
  customerPlanId?: string;
};

/**
 * Cria agendamento como PROVIDER.
 * Mantém o padrão de erro do apiClient (ApiError) + te dá o payload do backend em details.
 */
export async function createProviderAppointment(
  input: CreateProviderAppointmentInput
): Promise<ProviderBackendAppointment> {
  try {
    return await apiClient<ProviderBackendAppointment>("/appointments", {
      method: "POST",
      body: input,
    });
  } catch (err) {
    // Mantém o erro rico do apiClient (status/code/details)
    if (err instanceof ApiError) throw err;
    throw err;
  }
}

/**
 * Lista serviços para o provider (opcional, mas normalmente você vai precisar
 * para preencher o select de serviços no modal).
 *
 * O backend de /services no seu front já assume { items: [] }
 */
export type ProviderServiceForAppointment = {
  id: string;
  name: string;
  durationMin: number;
};

export async function fetchProviderServicesForAppointment(params?: {
  locationId?: string;
}): Promise<ProviderServiceForAppointment[]> {
  const qs = new URLSearchParams();
  if (params?.locationId) qs.set("locationId", params.locationId);
  // garantir que venha “tudo”
  qs.set("pageSize", "100");

  const path =
    qs.toString().length > 0 ? `/services?${qs.toString()}` : "/services";

  const res = await apiClient<{
    items: { id: string; name: string; durationMin: number }[];
  }>(path, { method: "GET" });

  return res.items ?? [];
}
