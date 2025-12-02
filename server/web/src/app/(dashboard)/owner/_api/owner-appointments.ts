import { apiClient } from "@/lib/api-client";

export type CreateAppointmentInput = {
  providerId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  clientName: string;
  clientPhone: string;
};

export async function createOwnerAppointment(input: CreateAppointmentInput) {
  // No teu projeto, o apiClient recebe (url, options)
  const res: any = await apiClient("/v1/appointments", {
    method: "POST",
    body: input,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const error: any = new Error("Erro ao criar agendamento");
    error.status = res.status;
    error.data = data;
    throw error;
  }

  // Se chegou aqui, deu tudo certo
  return res.json();
}
