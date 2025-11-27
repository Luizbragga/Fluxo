// src/app/(dashboard)/owner/_api/owner-services.ts
import { apiClient } from "@/lib/api-client";

/**
 * Shape que vem DO BACKEND (ServicesService.toViewModel)
 */
type RawServiceFromApi = {
  id: string;
  tenantId: string;
  name: string;
  durationMin: number;
  priceCents: number;
  priceLabel: string; // "10,00"
  pricePerHour: number | null;
  active: boolean;
  // outros campos do Prisma (createdAt, updatedAt etc) podem existir,
  // mas não precisamos tipar todos se não vamos usar.
};

/**
 * Shape que o FRONT vai usar na UI de Serviços.
 * Aqui já traduzimos nomes e valores (minutos, preço em euros etc.).
 */
export type OwnerService = {
  id: string;
  name: string;
  durationMinutes: number; // vem de durationMin
  basePrice: number; // em euros (priceCents / 100)
  priceLabel: string;
  pricePerHour: number | null;
  isActive: boolean;

  // ainda não existem no back, mas a UI já "fala" disso:
  category?: string | null;
  isPlanEligible?: boolean;
};

export type OwnerServiceStats = {
  serviceId: string;
  timesBookedMonth: number;
  revenueMonth: number;
  averageTicketWhenUsed: number;
};

// resposta do GET /v1/services no backend
type ServicesFindAllResponse = {
  items: RawServiceFromApi[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

/**
 * Busca os serviços do tenant logado.
 * Reaproveitado pela visão geral e pela tela de Serviços.
 */
export async function fetchOwnerServices(): Promise<{
  services: OwnerService[];
  stats: OwnerServiceStats[];
}> {
  // baseURL do apiClient já é http://localhost:4000/v1
  // então aqui é só "/services"
  const data = await apiClient<ServicesFindAllResponse>("/services", {
    method: "GET",
  });

  // Tradução RAW → UI
  const services: OwnerService[] = data.items.map((service) => ({
    id: service.id,
    name: service.name,
    durationMinutes: service.durationMin,
    basePrice: service.priceCents / 100,
    priceLabel: service.priceLabel,
    pricePerHour: service.pricePerHour,
    isActive: service.active,
    // por enquanto deixamos sem categoria/planos;
    // depois ligamos isso a plan templates/comissões.
    category: null,
    isPlanEligible: false,
  }));

  // Por enquanto, estatísticas mockadas (0 pra tudo).
  // Depois ligamos isso aos relatórios reais.
  const stats: OwnerServiceStats[] = services.map((service) => ({
    serviceId: service.id,
    timesBookedMonth: 0,
    revenueMonth: 0,
    averageTicketWhenUsed: 0,
  }));

  return { services, stats };
}
