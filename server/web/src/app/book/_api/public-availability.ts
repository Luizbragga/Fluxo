import { apiClient } from "@/lib/api-client";

export type PublicAppointment = {
  id: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status?:
    | "pending_payment"
    | "scheduled"
    | "in_service"
    | "done"
    | "no_show"
    | "cancelled"
    | "blocked";
};

export async function fetchPublicDayAppointments(params: {
  tenantSlug: string;
  locationSlug: string;
  providerId: string;
  date: string; // YYYY-MM-DD
}) {
  const qs = new URLSearchParams({
    providerId: params.providerId,
    date: params.date,
  });

  return apiClient<PublicAppointment[]>(
    `/public/booking/${encodeURIComponent(params.tenantSlug)}/${encodeURIComponent(params.locationSlug)}/appointments?${qs.toString()}`,
  );
}
