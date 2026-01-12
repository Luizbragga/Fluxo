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
    date: string; // ISO
    status: string;
    serviceName: string;
    servicePriceCents: number;
    commissionPercentage: number;
    providerEarningsCents: number;
    houseEarningsCents: number;
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
