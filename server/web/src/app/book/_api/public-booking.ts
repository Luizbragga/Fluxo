import { apiClient } from "@/lib/api-client";

export type PublicBookingData = {
  location: {
    id: string;
    name: string;
    bookingIntervalMin: number | null;
    businessHoursTemplate?: Record<string, [string, string][]> | null;
    tenantId: string;
    slug?: string | null;
    active?: boolean | null;

    bookingPaymentPolicy?:
      | "offline_only"
      | "online_optional"
      | "online_required";
    bookingDepositPercent?: number;
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

export async function fetchPublicBookingDataBySlug(params: {
  tenantSlug: string;
  locationSlug: string;
}) {
  return apiClient<PublicBookingData>(
    `/public/booking/${encodeURIComponent(params.tenantSlug)}/${encodeURIComponent(params.locationSlug)}`,
  );
}
