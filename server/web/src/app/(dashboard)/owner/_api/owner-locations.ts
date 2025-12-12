import { apiClient } from "@/lib/api-client";

/**
 * Shape de uma unidade (location) para o painel do owner.
 * Bate com o que estamos usando em /owner/unidades/page.tsx
 */
export type OwnerLocation = {
  id: string;
  name: string;
  slug?: string | null;
  active: boolean;
  businessHoursTemplate?: Record<string, [string, string][]> | null;
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
 * Como o backend devolve cada location (aprox. Prisma model).
 */
type BackendLocation = {
  id: string;
  name: string;
  slug?: string | null;
  active?: boolean;
  businessHoursTemplate?: any;
};

type BackendLocationsResponse =
  | BackendLocation[]
  | {
      data?: BackendLocation[];
      items?: BackendLocation[];
      meta?: Partial<LocationsPaginationMeta>;
    };

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

  const normalize = (loc: BackendLocation): OwnerLocation => ({
    id: loc.id,
    name: loc.name ?? loc.slug ?? "Unidade sem nome",
    slug: loc.slug ?? null,
    active: loc.active ?? true,
    businessHoursTemplate:
      (loc.businessHoursTemplate as Record<string, [string, string][]>) ?? null,
  });

  // meta default caso o backend não mande nada
  let meta: LocationsPaginationMeta = {
    page,
    pageSize,
    total: 0,
    totalPages: 1,
  };

  let list: BackendLocation[] = [];

  if (Array.isArray(raw)) {
    // Caso 1: backend devolve array direto
    list = raw;
    meta = {
      ...meta,
      total: raw.length,
      totalPages: 1,
    };
  } else if (raw) {
    // Caso 2: { data: [...] }  (como está hoje)
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
    data: list.map(normalize),
    meta,
  };
}
