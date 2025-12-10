// src/app/(dashboard)/owner/_api/owner-professionals.ts

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

// ---------------------- Lista de profissionais ----------------------

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

// ---------------------- Earnings agregados por provider (relatórios) -------

export type OwnerProviderEarningsItem = {
  providerId: string;
  providerName: string;
  location: { id: string; name: string } | null;
  servicePriceCents: number;
  providerEarningsCents: number;
  houseEarningsCents: number;
  appointmentsCount: number;
};

type OwnerProviderEarningsResponse = {
  from: string;
  to: string;
  totals: {
    servicePriceCents: number;
    providerEarningsCents: number;
    houseEarningsCents: number;
  };
  providers: OwnerProviderEarningsItem[];
};

/**
 * Busca earnings por provider para o mês atual (default do backend).
 * Usa /reports/provider-earnings.
 */
export async function fetchOwnerProviderEarnings(): Promise<
  OwnerProviderEarningsItem[]
> {
  const response = await apiClient<OwnerProviderEarningsResponse>(
    "/reports/provider-earnings"
  );

  return response.providers ?? [];
}
// ---------------------- Comissões por provider -----------------------------

export type OwnerProviderCommission = {
  id: string;
  percentage: number;
  active: boolean;
  service: {
    id: string;
    name: string;
    durationMin: number | null;
    priceCents: number | null;
  } | null;
};

/**
 * Busca regras de comissão de um provider específico.
 * Usa GET /providers/:id/commissions
 */
export async function fetchOwnerProviderCommissions(
  providerId: string
): Promise<OwnerProviderCommission[]> {
  const response = await apiClient<OwnerProviderCommission[]>(
    `/providers/${providerId}/commissions`
  );

  // o backend já devolve array direto
  return response ?? [];
}
