import { apiClient } from "@/lib/api-client";

/**
 * Mesmo tipo utilizado em owner-agenda.ts para mapear a resposta do backend.
 */
export type BackendAppointment = {
  id: string;
  providerId: string;
  startAt: string;
  endAt?: string; // opcional no retorno
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

export type CreateAppointmentInput = {
  providerId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  clientName: string;
  clientPhone: string;
  customerPlanId?: string;
};
export type OwnerServiceForAppointment = {
  id: string;
  name: string;
  durationMin: number;
};

/**
 * Cria um agendamento para o owner usando fetch direto.
 * Retorna o appointment criado ou lança erro com status e data.
 */
export async function createOwnerAppointment(
  input: CreateAppointmentInput
): Promise<BackendAppointment> {
  const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

  // token salvo no localStorage pelo login
  const token =
    typeof window !== "undefined" ? localStorage.getItem("fluxo_token") : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}/appointments`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Propaga o JSON de erro para que o front trate casos como CUSTOMER_NAME_CONFLICT
    const error: any = new Error(data?.message || "Erro ao criar agendamento");
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data as BackendAppointment;
}
export async function fetchOwnerServicesForAppointment(): Promise<
  OwnerServiceForAppointment[]
> {
  // usamos o apiClient padrão; o backend responde algo como { items: Service[], ... }
  const res = await apiClient<{
    items: { id: string; name: string; durationMin: number }[];
  }>("/services", {
    method: "GET",
  });

  return res.items;
}
