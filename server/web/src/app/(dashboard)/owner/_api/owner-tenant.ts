import { apiClient } from "@/lib/api-client";

export type OwnerTenant = {
  id: string;
  name: string;
  slug: string;
  nif: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export async function fetchOwnerTenantMe(): Promise<OwnerTenant> {
  return apiClient<OwnerTenant>("/tenants/me", { method: "GET" });
}
