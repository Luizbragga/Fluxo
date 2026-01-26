import { apiClient } from "@/lib/api-client";

export type PublicAppointment = {
  id: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status?: "scheduled" | "in_service" | "done" | "no_show" | "cancelled";
};

export async function fetchPublicDayAppointments(params: {
  locationId: string;
  providerId: string;
  date: string; // YYYY-MM-DD
}) {
  const qs = new URLSearchParams({
    locationId: params.locationId,
    providerId: params.providerId,
    date: params.date,
  });

  // endpoint público que vamos assumir (e ajustar se o teu swagger for diferente)
  return apiClient<PublicAppointment[]>(
    `/public/appointments?${qs.toString()}`,
  );
}
