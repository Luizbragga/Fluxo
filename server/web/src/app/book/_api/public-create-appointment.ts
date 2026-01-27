import { apiClient } from "@/lib/api-client";

export type CreatePublicAppointmentPayload = {
  serviceId: string;
  providerId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  customerName: string;
  customerPhone: string;
};

export async function createPublicAppointmentBySlug(params: {
  tenantSlug: string;
  locationSlug: string;
  payload: CreatePublicAppointmentPayload;
}) {
  const { tenantSlug, locationSlug, payload } = params;

  return apiClient<{ ok: boolean; appointment?: any }>(
    `/public/booking/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(
      locationSlug,
    )}/appointments`,
    {
      method: "POST",
      body: payload,
    },
  );
}
