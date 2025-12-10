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
 * Suporta 3 formatos comuns:
 *  - array direto
 *  - { items: [...] }
 *  - { data: [...], meta: {...} }
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
  priceLabel: string;
  pricePerHour: number | null;
  active: boolean;
  locationId?: string | null;
  category?: string | null;
  notes?: string | null;

  // vindo do backend (findAll), opcional para não quebrar create/update:
  usesThisMonth?: number;
  revenueThisMonth?: number;
};

/**
 * Shape que o FRONT vai usar na UI de Serviços.
 */
export type OwnerService = {
  id: string;
  name: string;
  durationMinutes: number; // vem de durationMin
  basePrice: number; // em euros (priceCents / 100)
  priceLabel: string;
  pricePerHour: number | null;
  isActive: boolean;
  category?: string | null;
  isPlanEligible?: boolean;
  notes?: string | null;
};

export type OwnerServiceStats = {
  serviceId: string;
  timesBookedMonth: number;
  revenueMonth: number;
  averageTicketWhenUsed: number;
};
export type OwnerServicePlanUsage = {
  serviceId: string;
  totalPlans: number;
  plans: {
    id: string;
    name: string;
  }[];
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
    category: service.category ?? null,
    isPlanEligible: false,
    notes: service.notes ?? null,
  }));

  // Estatísticas do serviço, usando o que vem do backend
  // Estatísticas do serviço, usando o que vem do backend
  const stats: OwnerServiceStats[] = data.items.map((service) => {
    const times = service.usesThisMonth ?? 0;
    const revenue = service.revenueThisMonth ?? 0;

    return {
      serviceId: service.id,
      timesBookedMonth: times,
      revenueMonth: revenue,
      averageTicketWhenUsed: times > 0 ? revenue / times : 0,
    };
  });

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
  category?: string | null;
  notes?: string | null;
}): Promise<OwnerService> {
  const body = {
    name: input.name,
    durationMin: input.durationMinutes,
    priceCents: Math.round(input.basePrice * 100),
    locationId: input.locationId,
    category: input.category ?? null,
    notes: input.notes ?? null,
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
    category: created.category ?? null,
    isPlanEligible: false,
    notes: created.notes ?? null,
  };
}

/**
 * Atualiza apenas o estado ativo/inativo de um serviço.
 */
export async function updateOwnerServiceActive(input: {
  id: string;
  isActive: boolean;
}): Promise<OwnerService> {
  const body = {
    active: input.isActive,
  };

  const updated = await apiClient<RawServiceFromApi>(`/services/${input.id}`, {
    method: "PATCH",
    body,
  });

  return {
    id: updated.id,
    name: updated.name,
    durationMinutes: updated.durationMin,
    basePrice: updated.priceCents / 100,
    priceLabel: updated.priceLabel,
    pricePerHour: updated.pricePerHour,
    isActive: updated.active,
    category: updated.category ?? null,
    isPlanEligible: false,
  };
}

/**
 * Atualiza informações principais do serviço:
 * nome, duração, preço base e categoria.
 */
export async function updateOwnerServiceInfo(input: {
  id: string;
  name: string;
  durationMinutes: number;
  basePrice: number;
  category?: string | null;
}): Promise<OwnerService> {
  const body = {
    name: input.name,
    durationMin: input.durationMinutes,
    priceCents: Math.round(input.basePrice * 100),
    category: input.category ?? null,
  };

  const updated = await apiClient<RawServiceFromApi>(`/services/${input.id}`, {
    method: "PATCH",
    body,
  });

  return {
    id: updated.id,
    name: updated.name,
    durationMinutes: updated.durationMin,
    basePrice: updated.priceCents / 100,
    priceLabel: updated.priceLabel,
    pricePerHour: updated.pricePerHour,
    isActive: updated.active,
    category: updated.category ?? null,
    isPlanEligible: false,
  };
}
/**
 * Busca em quais planos (PlanTemplate) este serviço está presente.
 */
export async function fetchOwnerServicePlanUsage(
  serviceId: string
): Promise<OwnerServicePlanUsage> {
  const data = await apiClient<OwnerServicePlanUsage>(
    `/plan-templates/by-service/${serviceId}`,
    {
      method: "GET",
    }
  );

  return data;
}
/**
 * Atualiza apenas as notas internas (observação) do serviço.
 */
export async function updateOwnerServiceNotes(input: {
  id: string;
  notes: string | null;
}): Promise<OwnerService> {
  const body = {
    notes: input.notes,
  };

  const updated = await apiClient<RawServiceFromApi>(`/services/${input.id}`, {
    method: "PATCH",
    body,
  });

  return {
    id: updated.id,
    name: updated.name,
    durationMinutes: updated.durationMin,
    basePrice: updated.priceCents / 100,
    priceLabel: updated.priceLabel,
    pricePerHour: updated.pricePerHour,
    isActive: updated.active,
    category: updated.category ?? null,
    isPlanEligible: false,
    notes: updated.notes ?? null,
  };
}
