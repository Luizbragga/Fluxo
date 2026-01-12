import { apiClient } from "@/lib/api-client";

export type ProviderListItem = {
  id: string;
  tenantId: string;
  userId: string;
  locationId: string;
  name: string;
  specialty: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    phone: string | null;
  } | null;
  location: {
    id: string;
    tenantId: string;
    name: string;
    slug: string;
    address: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type ProvidersListResponse = {
  data: ProviderListItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export async function listOwnerProviders(params?: {
  page?: number;
  pageSize?: number;
}) {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 20;

  return apiClient<ProvidersListResponse>(
    `/providers?page=${page}&pageSize=${pageSize}`,
    { method: "GET" }
  );
}
