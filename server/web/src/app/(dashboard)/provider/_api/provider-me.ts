import { apiClient } from "@/lib/api-client";

export type ProviderMeResponse = {
  id: string;
  tenantId: string;
  userId: string;
  locationId: string;
  name: string;
  specialty: string;
  active: boolean;
  weekdayTemplate: Record<string, [string, string][]>;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
    phone: string | null;
  } | null;
  location?: {
    id: string;
    name: string;
    slug: string;
    address: string | null;
  } | null;
};

export async function fetchProviderMe(): Promise<ProviderMeResponse> {
  return apiClient<ProviderMeResponse>("/providers/me", {
    method: "GET",
  });
}
