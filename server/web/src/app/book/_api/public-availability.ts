import { apiClient } from "@/lib/api-client";
export type PublicAppointment = {
  id: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status?:
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
  locationId: string;
  providerId: string;
  date: string; // YYYY-MM-DD
}) {
  const qs = new URLSearchParams({
    locationId: params.locationId,
    providerId: params.providerId,
    date: params.date,
  });

  return apiClient<PublicAppointment[]>(
    `/public/booking/${params.tenantSlug}/${params.locationSlug}/appointments?${qs.toString()}`,
  );
}
