import { apiClient } from "@/lib/api-client";

export type ProviderEarningsResponse = {
  providerId: string;
  from: string; // ISO
  to: string; // ISO
  totals: {
    servicePriceCents: number;
    providerEarningsCents: number;
    houseEarningsCents: number;
  };
  appointments: Array<{
    id: string;
    date: string; // ISO startAt
    status: string; // done | cancelled | no_show | scheduled...
    serviceName: string;

    // sempre existe no Appointment:
    servicePriceCents: number;

    // só existe em done (earning):
    commissionPercentage?: number | null;
    providerEarningsCents?: number | null;
    houseEarningsCents?: number | null;
  }>;
};

/**
 * Busca ganhos do provider autenticado.
 * GET /providers/me/earnings?from=&to=
 */
export async function fetchMyEarnings(params?: {
  from?: string; // ISO
  to?: string; // ISO
}): Promise<ProviderEarningsResponse> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);

  const url = qs.toString()
    ? `/providers/me/earnings?${qs.toString()}`
    : `/providers/me/earnings`;

  return apiClient<ProviderEarningsResponse>(url, {
    method: "GET",
  });
}
