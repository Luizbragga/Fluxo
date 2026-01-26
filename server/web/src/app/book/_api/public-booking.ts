import { apiClient } from "@/lib/api-client";

export type PublicBookingData = {
  location: {
    id: string;
    name: string;
    bookingIntervalMin: number | null;
    businessHoursTemplate?: Record<string, [string, string][]> | null;
    tenantId: string;
  };
  services: Array<{
    id: string;
    name: string;
    durationMin: number;
    priceCents: number | null;
  }>;
  providers: Array<{
    id: string;
    name: string;
  }>;
};

export async function fetchPublicBookingData(locationId: string) {
  // IMPORTANTE: seu swagger mostra /v1/public/booking/:locationId
  // e seu apiClient provavelmente já tem baseURL com /v1 embutido.
  // Então aqui usamos "/public/booking/..."
  return apiClient<PublicBookingData>(
    `/public/booking/${encodeURIComponent(locationId)}`,
  );
}
