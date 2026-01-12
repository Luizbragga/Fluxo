// server/web/src/app/(dashboard)/owner/_api/owner-tenant.ts
import { apiClient } from "@/lib/api-client";

export type OwnerTenant = {
  id: string;
  brandName: string | null;
  legalName: string | null;
  slug: string;
  nif: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type UpdateOwnerTenantInput = Partial<
  Pick<OwnerTenant, "brandName" | "legalName" | "nif">
>;

export async function fetchOwnerTenantMe(): Promise<OwnerTenant> {
  return apiClient<OwnerTenant>("/tenants/me", { method: "GET" });
}

export async function updateOwnerTenantMe(
  dto: UpdateOwnerTenantInput
): Promise<OwnerTenant> {
  return apiClient<OwnerTenant>("/tenants/me", {
    method: "PATCH",
    body: dto,
  });
}
