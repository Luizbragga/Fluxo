import { apiClient } from "@/lib/api-client";

/**
 * Shape de uma unidade (location) para o painel do owner.
 */
export type OwnerLocation = {
  id: string;
  name: string;
  slug?: string | null;
  active: boolean;
  businessHoursTemplate?: Record<string, [string, string][]> | null;

  managerProviderId?: string | null;
  managerProviderName?: string | null;
};

/**
 * Metadados de paginação vindos do backend.
 */
export type LocationsPaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/**
 * Como o backend devolve cada location.
 */
type BackendLocation = {
  id: string;
  name: string;
  slug?: string | null;
  active?: boolean;
  businessHoursTemplate?: any;

  managerProviderId?: string | null;
  managerProviderName?: string | null;
  managerProvider?: { id: string; name: string } | null;
};

type BackendLocationsResponse =
  | BackendLocation[]
  | {
      data?: BackendLocation[];
      items?: BackendLocation[];
      meta?: Partial<LocationsPaginationMeta>;
    };

/**
 * Normaliza uma Location vinda da API para o formato da UI.
 */
function normalizeLocation(loc: BackendLocation): OwnerLocation {
  return {
    id: loc.id,
    name: loc.name ?? loc.slug ?? "Unidade sem nome",
    slug: loc.slug ?? null,
    active: loc.active ?? true,
    businessHoursTemplate:
      (loc.businessHoursTemplate as Record<string, [string, string][]>) ?? null,
    managerProviderId: loc.managerProviderId ?? loc.managerProvider?.id ?? null,
    managerProviderName:
      loc.managerProviderName ?? loc.managerProvider?.name ?? null,
  };
}

/**
 * Busca as locations do tenant logado, com paginação.
 * Sempre devolve { data, meta } já normalizados.
 */
export async function fetchOwnerLocations(params?: {
  page?: number;
  pageSize?: number;
}): Promise<{ data: OwnerLocation[]; meta: LocationsPaginationMeta }> {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 20;

  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  }).toString();

  const raw = await apiClient<BackendLocationsResponse>(`/locations?${qs}`, {
    method: "GET",
  });

  let meta: LocationsPaginationMeta = {
    page,
    pageSize,
    total: 0,
    totalPages: 1,
  };

  let list: BackendLocation[] = [];

  if (Array.isArray(raw)) {
    list = raw;
    meta = {
      ...meta,
      total: raw.length,
      totalPages: 1,
    };
  } else if (raw) {
    if (Array.isArray(raw.data)) {
      list = raw.data;
    } else if (Array.isArray(raw.items)) {
      list = raw.items;
    }

    if (raw.meta) {
      meta = {
        page: raw.meta.page ?? meta.page,
        pageSize: raw.meta.pageSize ?? meta.pageSize,
        total: raw.meta.total ?? meta.total,
        totalPages: raw.meta.totalPages ?? meta.totalPages,
      };
    }
  }

  return {
    data: list.map(normalizeLocation),
    meta,
  };
}

/**
 * Cria uma nova unidade (location) para o tenant logado.
 */
export async function createOwnerLocation(input: {
  name: string;
  slug?: string | null;
  businessHoursTemplate?: Record<string, [string, string][]> | null;
}): Promise<OwnerLocation> {
  const body: any = {
    name: input.name,
  };

  if (input.slug) {
    body.slug = input.slug;
  }
  if (typeof input.businessHoursTemplate !== "undefined") {
    body.businessHoursTemplate = input.businessHoursTemplate;
  }

  const created = await apiClient<BackendLocation>("/locations", {
    method: "POST",
    body,
  });

  return normalizeLocation(created);
}

/**
 * Ativa / desativa uma unidade (toggle de "active").
 */
export async function updateOwnerLocationActive(params: {
  id: string;
  active: boolean;
}): Promise<OwnerLocation> {
  const updated = await apiClient<BackendLocation>(`/locations/${params.id}`, {
    method: "PATCH",
    body: {
      active: params.active,
    },
  });

  return normalizeLocation(updated);
}
export async function updateOwnerLocationManager(params: {
  id: string;
  managerProviderId: string | null;
}): Promise<OwnerLocation> {
  const updated = await apiClient<BackendLocation>(`/locations/${params.id}`, {
    method: "PATCH",
    body: {
      managerProviderId: params.managerProviderId,
    },
  });

  return normalizeLocation(updated);
}
export async function updateOwnerLocationBusinessHours(params: {
  id: string;
  businessHoursTemplate: Record<string, [string, string][]>;
}): Promise<OwnerLocation> {
  const updated = await apiClient<BackendLocation>(`/locations/${params.id}`, {
    method: "PATCH",
    body: {
      businessHoursTemplate: params.businessHoursTemplate,
    },
  });

  return normalizeLocation(updated);
}
