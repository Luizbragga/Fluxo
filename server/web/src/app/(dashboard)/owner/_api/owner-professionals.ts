// src/app/(dashboard)/owner/profissionais/_api/owner-professionals.ts

import { apiClient } from "@/lib/api-client";

// ---------------------- DTOs vindos do backend ----------------------

type ProviderLocationDto = {
  id: string;
  name: string;
};

type ProviderUserDto = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  phone: string | null;
};

type ProviderDto = {
  id: string;
  name: string;
  specialty: string | null;
  active: boolean;
  location: ProviderLocationDto | null;
  user: ProviderUserDto | null;
};

type ProvidersListResponse = {
  data: ProviderDto[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

// ---------------------- Tipo usado pela tela do owner ----------------------

export type OwnerProfessional = {
  id: string;
  name: string;
  specialty: string;
  locationName: string;
  isActive: boolean;
  // 0–100 – por enquanto ainda não calculamos de verdade
  averageOccupation: number;
};

// ---------------------- Chamada de API ----------------------

export async function fetchOwnerProfessionals(): Promise<OwnerProfessional[]> {
  // apiClient é função, sem .get / .post
  // Paginação simples por query string
  const response = await apiClient<ProvidersListResponse>(
    "/providers?page=1&pageSize=50"
  );

  const rows = response.data ?? [];

  return rows.map((provider) => ({
    id: provider.id,
    name: provider.name,
    specialty: provider.specialty ?? "Profissional",
    locationName: provider.location?.name ?? "Unidade do tenant",
    isActive: provider.active,
    // valor REAL por enquanto: ainda não temos cálculo de ocupação
    averageOccupation: 0,
  }));
}
