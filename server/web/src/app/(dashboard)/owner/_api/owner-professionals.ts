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

// ---------------------- Template padrão de horário ----------------------
// Seg–Sáb, 08:00–12:00 e 14:00–20:00; Domingo fechado.

const DEFAULT_WEEKDAY_TEMPLATE: Record<string, [string, string][]> = {
  mon: [
    ["08:00", "12:00"],
    ["14:00", "20:00"],
  ],
  tue: [
    ["08:00", "12:00"],
    ["14:00", "20:00"],
  ],
  wed: [
    ["08:00", "12:00"],
    ["14:00", "20:00"],
  ],
  thu: [
    ["08:00", "12:00"],
    ["14:00", "20:00"],
  ],
  fri: [
    ["08:00", "12:00"],
    ["14:00", "20:00"],
  ],
  sat: [
    ["08:00", "12:00"],
    ["14:00", "20:00"],
  ],
  sun: [],
};

// ---------------------- Tipos usados pela tela do owner ----------------------

export type OwnerProfessional = {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialty: string;
  locationId: string;
  locationName: string;
  isActive: boolean;

  // 0–100 (a ocupação REAL vem do relatório /reports/provider-earnings)
  averageOccupation: number;
};

export type CreateOwnerProfessionalInput = {
  name: string;
  email: string;
  phone: string;
  locationId: string;
  specialty?:
    | "barber"
    | "hairdresser"
    | "nail"
    | "esthetic"
    | "makeup"
    | "tattoo"
    | "other";
  weekdayTemplate?: Record<string, [string, string][]>;
};

export type UpdateOwnerProfessionalInput = {
  name: string;
  email: string;
  phone: string;
  locationId: string;
  specialty?:
    | "barber"
    | "hairdresser"
    | "nail"
    | "esthetic"
    | "makeup"
    | "tattoo"
    | "other";
  weekdayTemplate?: Record<string, [string, string][]>;
  active?: boolean;
};

// (ainda não estamos usando, mas deixamos preparado)
export type OwnerAvailableUser = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
};

// ---------------------- Lista de profissionais ----------------------

export async function fetchOwnerAvailableProviderUsers(): Promise<
  OwnerAvailableUser[]
> {
  const data = await apiClient<OwnerAvailableUser[]>(
    "/providers/available-users"
  );
  return data;
}

export async function fetchOwnerProfessionals(): Promise<OwnerProfessional[]> {
  const response = await apiClient<ProvidersListResponse>(
    "/providers?page=1&pageSize=50"
  );

  const rows = response.data ?? [];

  return rows.map((provider) => ({
    id: provider.id,
    name: provider.name,
    email: provider.user?.email ?? "",
    phone: provider.user?.phone ?? "",
    specialty: provider.specialty ?? "Profissional",
    locationId: provider.location?.id ?? "",
    locationName: provider.location?.name ?? "Unidade do tenant",
    isActive: provider.active,
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

  // campos vindos do backend
  workedMinutes: number;
  availableMinutes: number;
  occupationPercentage: number;
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

export async function fetchOwnerProviderEarnings(params?: {
  from?: string;
  to?: string;
}): Promise<OwnerProviderEarningsItem[]> {
  const query = new URLSearchParams();

  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);

  const path =
    query.toString().length > 0
      ? `/reports/provider-earnings?${query.toString()}`
      : "/reports/provider-earnings";

  const response = await apiClient<OwnerProviderEarningsResponse>(path);

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

export type UpsertProviderCommissionPayload = {
  serviceId?: string | null;
  percentage: number;
  active?: boolean;
};

export async function fetchOwnerProviderCommissions(
  providerId: string
): Promise<OwnerProviderCommission[]> {
  const response = await apiClient<OwnerProviderCommission[]>(
    `/providers/${providerId}/commissions`
  );

  return response ?? [];
}

export async function upsertOwnerProviderCommission(
  providerId: string,
  payload: UpsertProviderCommissionPayload
): Promise<OwnerProviderCommission> {
  const result = await apiClient<OwnerProviderCommission>(
    `/providers/${providerId}/commissions`,
    {
      method: "POST",
      body: payload,
    }
  );

  return result;
}

// ---------------------- Repasses recentes por provider ----------------------

type ProviderPayoutsResponse = {
  from: string;
  to: string;
  items: {
    provider?: { id: string; name: string } | null;
    providerEarningsCents: number;
    payoutStatus: "pending" | "paid" | string;
  }[];
};

export type OwnerProviderPayout = {
  id: string;
  periodLabel: string;
  amount: number;
  status: "pending" | "paid";
};

function formatShortDate(date: Date) {
  return date.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
  });
}

export async function fetchOwnerProviderPayouts(
  providerId: string
): Promise<OwnerProviderPayout[]> {
  const query = new URLSearchParams({ providerId }).toString();

  const response = await apiClient<ProviderPayoutsResponse>(
    `/reports/provider-payouts?${query}`
  );

  const fromDate = new Date(response.from);
  const toDate = new Date(response.to);

  let pendingCents = 0;
  let paidCents = 0;

  for (const item of response.items ?? []) {
    const status =
      (item.payoutStatus as string) === "paid" ? "paid" : "pending";

    if (status === "paid") paidCents += item.providerEarningsCents;
    else pendingCents += item.providerEarningsCents;
  }

  const results: OwnerProviderPayout[] = [];

  if (pendingCents > 0) {
    results.push({
      id: `${providerId}-pending`,
      periodLabel: `Período ${formatShortDate(fromDate)} – ${formatShortDate(
        toDate
      )} · repasses pendentes`,
      amount: pendingCents / 100,
      status: "pending",
    });
  }

  if (paidCents > 0) {
    results.push({
      id: `${providerId}-paid`,
      periodLabel: `Período ${formatShortDate(fromDate)} – ${formatShortDate(
        toDate
      )} · repasses pagos`,
      amount: paidCents / 100,
      status: "paid",
    });
  }

  return results;
}

// ---------------------- Criar profissional ----------------------

type ProviderApiResponse = {
  id: string;
  name: string;
  specialty: string;
  active: boolean;
  location?: { id: string; name: string } | null;
  user?: { id: string; email: string; phone: string | null } | null;
};

export async function createOwnerProfessional(
  input: CreateOwnerProfessionalInput
): Promise<OwnerProfessional> {
  const provider = await apiClient<ProviderApiResponse>("/providers", {
    method: "POST",
    body: {
      ...input,
      active: true,
      weekdayTemplate: input.weekdayTemplate ?? DEFAULT_WEEKDAY_TEMPLATE,
    },
  });

  return {
    id: provider.id,
    name: provider.name,
    email: provider.user?.email ?? input.email,
    phone: provider.user?.phone ?? input.phone,
    specialty: provider.specialty,
    locationId: provider.location?.id ?? input.locationId,
    locationName: provider.location?.name ?? "Sem unidade",
    averageOccupation: 0,
    isActive: provider.active,
  };
}

// ---------------------- Editar profissional ----------------------

export async function updateOwnerProfessional(
  providerId: string,
  input: UpdateOwnerProfessionalInput
): Promise<OwnerProfessional> {
  const provider = await apiClient<ProviderDto>(`/providers/${providerId}`, {
    method: "PATCH",
    body: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      locationId: input.locationId,
      specialty: input.specialty,
      weekdayTemplate: input.weekdayTemplate,
      active: input.active,
    },
  });

  return {
    id: provider.id,
    name: provider.name,
    email: provider.user?.email ?? "",
    phone: provider.user?.phone ?? "",
    specialty: provider.specialty ?? "Profissional",
    locationId: provider.location?.id ?? "",
    locationName: provider.location?.name ?? "Unidade do tenant",
    isActive: provider.active,
    averageOccupation: 0,
  };
}
