import { apiClient } from "@/lib/api-client";

/**
 * Unidades (locations) que o owner pode ver.
 */
export type OwnerLocation = {
  id: string;
  name: string;
};

/**
 * Tenta buscar as locations do tenant logado.
 * Suporta 2 formatos comuns: { items: [...] } ou array direto.
 */
export async function fetchOwnerLocations(): Promise<OwnerLocation[]> {
  const data = await apiClient<any>("/locations", {
    method: "GET",
  });

  const normalize = (loc: any): OwnerLocation => ({
    id: loc.id,
    name: loc.name ?? loc.slug ?? "Unidade sem nome",
  });

  // caso 1: API devolve array direto
  if (Array.isArray(data)) {
    return data.map(normalize);
  }

  // caso 2: { items: [...] }
  if (Array.isArray(data?.items)) {
    return data.items.map(normalize);
  }

  // caso 3: { data: [...], meta: {...} }  <-- SEU BACKEND HOJE
  if (Array.isArray(data?.data)) {
    return data.data.map(normalize);
  }

  return [];
}

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
  locationId?: string | null;
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
 * Busca os serviços da unidade selecionada (locationId).
 */
export async function fetchOwnerServices(locationId?: string): Promise<{
  services: OwnerService[];
  stats: OwnerServiceStats[];
}> {
  const query = locationId
    ? `?locationId=${encodeURIComponent(locationId)}`
    : "";

  const data = await apiClient<ServicesFindAllResponse>(`/services${query}`, {
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

/**
 * Cria um novo serviço para o tenant logado,
 * sempre amarrando na unidade (locationId) selecionada.
 */
export async function createOwnerService(input: {
  name: string;
  durationMinutes: number;
  basePrice: number;
  locationId: string;
}): Promise<OwnerService> {
  const body = {
    name: input.name,
    durationMin: input.durationMinutes,
    priceCents: Math.round(input.basePrice * 100),
    locationId: input.locationId,
  };

  const created = await apiClient<RawServiceFromApi>("/services", {
    method: "POST",
    body,
  });

  return {
    id: created.id,
    name: created.name,
    durationMinutes: created.durationMin,
    basePrice: created.priceCents / 100,
    priceLabel: created.priceLabel,
    pricePerHour: created.pricePerHour,
    isActive: created.active,
    category: null,
    isPlanEligible: false,
  };
}
