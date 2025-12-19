import { apiClient } from "@/lib/api-client";

/**
 * Shape de um usuário para o painel do owner.
 */
export type OwnerUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;

  // opcionais (se o backend devolver)
  locationId?: string | null;
  createdAt?: string | null;
};

type BackendUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  active?: boolean | null;

  locationId?: string | null;
  createdAt?: string | null;
};

type BackendUsersResponse =
  | BackendUser[]
  | {
      data?: BackendUser[];
      items?: BackendUser[];
    };

function normalizeUser(u: BackendUser): OwnerUser {
  return {
    id: u.id,
    name: u.name ?? "Sem nome",
    email: u.email ?? "Sem e-mail",
    role: u.role ?? "unknown",
    active: typeof u.active === "boolean" ? u.active : true,
    locationId: typeof u.locationId === "undefined" ? null : u.locationId,
    createdAt: typeof u.createdAt === "undefined" ? null : u.createdAt,
  };
}

/**
 * Lista usuários do tenant logado (owner/admin).
 */
export async function fetchOwnerUsers(): Promise<OwnerUser[]> {
  const raw = await apiClient<BackendUsersResponse>("/users", {
    method: "GET",
  });

  let list: BackendUser[] = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw) {
    if (Array.isArray(raw.data)) list = raw.data;
    else if (Array.isArray(raw.items)) list = raw.items;
  }

  return list.map(normalizeUser);
}
