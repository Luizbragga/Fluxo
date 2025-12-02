import { apiClient } from "@/lib/api-client";

// -------------------- Tipos vindos do backend --------------------

type PlanTemplateDto = {
  id: string;
  tenantId: string;
  locationId: string;
  name: string;
  description: string | null;
  priceCents: number;
  intervalDays: number;
  visitsPerInterval: number | null;
  sameDayServiceIds: string[] | null;
  allowedWeekdays: number[] | null;
  minDaysBetweenVisits: number | null;
  allowedStartTimeMinutes: number | null;
  allowedEndTimeMinutes: number | null;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type CustomerPlanStatusDto = string; // "active", "late", "cancelled"...

// antes: type CustomerPlanDto = { ... }
export type CustomerPlanDto = {
  id: string;
  tenantId: string;
  locationId: string;
  planTemplateId: string;
  customerName: string;
  customerPhone: string | null;
  status: CustomerPlanStatusDto;
  currentCycleStart: string;
  currentCycleEnd: string;

  // estes campos também existem no backend e já usamos em outros lugares
  visitsUsedInCycle?: number;
  carryOverVisits?: number;
  lastPaymentStatus?: string | null;
  lastPaymentAt?: string | null;
  canRegisterPayment?: boolean;
  createdAt?: string;
  updatedAt?: string;

  planTemplate: PlanTemplateDto;
};

// -------------------- Tipos para o UI (iguais aos mocks) --------------------

export type PlanTemplateUI = {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: "EUR";
  visitsIncluded: number;
  periodLabel: string; // "Mensal", "Semanal", etc.
  isActive: boolean;
  minDaysBetweenVisits?: number | null;
  allowedWeekdays?: number[] | null;
  allowedStartTimeMinutes?: number | null;
  allowedEndTimeMinutes?: number | null;
};

export type PlanStats = {
  planId: string;
  activeCustomers: number;
  totalRevenueMonth: number;
  churnRatePercent: number;
};

export type PlanCustomer = {
  id: string;
  name: string;
  phone: string;
  startedAt: string; // = currentCycleStart
  status: "active" | "late" | "cancelled" | string;
  nextChargeDate?: string; // = currentCycleEnd
  nextChargeAmount?: number; // valor do ciclo
  lastPaymentAt?: string | null; // última data de pagamento
};

export type OwnerPlansData = {
  planTemplates: PlanTemplateUI[];
  planStats: PlanStats[];
  planCustomersByPlan: Record<string, PlanCustomer[]>;
};

export type OwnerService = {
  id: string;
  name: string;
  priceEuro: number;
};

type ServiceDto = {
  id: string;
  name: string;
  priceCents: number;
  locationId: string;
};

export type CreatePlanTemplateInput = {
  locationId: string;
  name: string;
  description?: string;
  priceEuro: number;
  intervalDays: number; // vamos mandar sempre 30
  visitsPerInterval?: number;
  sameDayServiceIds?: string[];
  allowedWeekdays?: number[];
  minDaysBetweenVisits?: number;
  allowedStartTimeMinutes?: number;
  allowedEndTimeMinutes?: number;
};
export type UpdatePlanTemplateInput = {
  id: string;
  locationId?: string;
  name?: string;
  description?: string;
  priceEuro?: number;
  intervalDays?: number;
  visitsPerInterval?: number;
  sameDayServiceIds?: string[];
  allowedWeekdays?: number[];
  minDaysBetweenVisits?: number;
  allowedStartTimeMinutes?: number;
  allowedEndTimeMinutes?: number;
};

export type PayCustomerPlanInput = {
  customerPlanId: string;
  amountEuro: number;
  paidAt?: string; // opcional, se quiser enviar data específica
};
export async function payOwnerCustomerPlan(
  input: PayCustomerPlanInput
): Promise<CustomerPlanDto> {
  const body: { amountCents: number; paidAt?: string } = {
    amountCents: Math.round(input.amountEuro * 100),
    ...(input.paidAt ? { paidAt: input.paidAt } : {}),
  };

  // backend está com @Post(':id/pay')
  return apiClient<CustomerPlanDto>(
    `/plans/customer-plans/${input.customerPlanId}/pay`,
    {
      method: "POST",
      body,
    }
  );
}

// -------------------- Tipo específico para o card de billing -----------------

export type OwnerCustomerPlan = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  status: CustomerPlanStatusDto;
  lastPaymentStatus: string; // "paid" | "pending" | "late" | ...
  currentCycleStart: string;
  currentCycleEnd: string;
  visitsUsedInCycle: number;
  carryOverVisits: number;
  planTemplate: {
    id: string;
    name: string;
    priceCents: number;
    visitsPerInterval: number | null;
  };
};

// -------------------- Helpers de chamada à API (usando apiClient) -----------

async function fetchPlanTemplates(
  locationId?: string
): Promise<PlanTemplateDto[]> {
  const params = new URLSearchParams();
  if (locationId) params.set("locationId", locationId);

  const path =
    params.toString().length > 0
      ? `/plan-templates?${params.toString()}`
      : `/plan-templates`;

  return apiClient<PlanTemplateDto[]>(path, { method: "GET" });
}

async function fetchCustomerPlans(
  locationId?: string
): Promise<CustomerPlanDto[]> {
  const params = new URLSearchParams();
  if (locationId) params.set("locationId", locationId);

  const path =
    params.toString().length > 0
      ? `/plans/customer-plans?${params.toString()}`
      : `/plans/customer-plans`;

  return apiClient<CustomerPlanDto[]>(path, { method: "GET" });
}

// tipo para criação de um plano de cliente pelo owner
export type CreateCustomerPlanInput = {
  planTemplateId: string;
  customerName: string;
  customerPhone?: string;
  status?: "active" | "late" | "cancelled";
};

export async function createOwnerCustomerPlan(
  input: CreateCustomerPlanInput
): Promise<CustomerPlanDto> {
  const body = {
    planTemplateId: input.planTemplateId,
    customerName: input.customerName,
    customerPhone: input.customerPhone || undefined,
    status: input.status ?? "active",
  };

  // backend: @Post() em /plans/customer-plans
  const dto = await apiClient<CustomerPlanDto>("/plans/customer-plans", {
    method: "POST",
    body,
  });

  return dto;
}

// -------------------- Transformações auxiliares -----------------------------

function intervalDaysToLabel(intervalDays: number): string {
  if (intervalDays === 30) return "Mensal";
  if (intervalDays === 7) return "Semanal";
  if (intervalDays === 14) return "Quinzenal";
  return `${intervalDays} dias`;
}

function normalizePlanTemplate(dto: PlanTemplateDto): PlanTemplateUI {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description ?? "",
    price: dto.priceCents / 100,
    currency: "EUR",
    visitsIncluded: dto.visitsPerInterval ?? 1,
    periodLabel: intervalDaysToLabel(dto.intervalDays),
    isActive: dto.active ?? true,
    minDaysBetweenVisits: dto.minDaysBetweenVisits,
    allowedWeekdays: dto.allowedWeekdays ?? null,
    allowedStartTimeMinutes: dto.allowedStartTimeMinutes ?? null,
    allowedEndTimeMinutes: dto.allowedEndTimeMinutes ?? null,
  };
}

function buildStatsAndCustomers(
  templates: PlanTemplateDto[],
  customerPlans: CustomerPlanDto[]
): Omit<OwnerPlansData, "planTemplates"> {
  const planStats: PlanStats[] = [];
  const planCustomersByPlan: Record<string, PlanCustomer[]> = {};

  for (const template of templates) {
    const customersOfPlan = customerPlans.filter(
      (cp) => cp.planTemplateId === template.id
    );

    const customersUI: PlanCustomer[] = customersOfPlan.map((cp) => ({
      id: cp.id,
      name: cp.customerName,
      phone: cp.customerPhone ?? "",
      // início do ciclo atual (já pago)
      startedAt: cp.currentCycleStart,
      status: cp.status,
      // próxima cobrança = fim do ciclo atual
      nextChargeDate: cp.currentCycleEnd,
      nextChargeAmount: cp.planTemplate.priceCents / 100,
      // vem direto do DTO
      lastPaymentAt: cp.lastPaymentAt ?? null,
    }));

    planCustomersByPlan[template.id] = customersUI;

    const totalCustomers = customersOfPlan.length;
    const activeCustomers = customersOfPlan.filter(
      (c) => c.status === "active"
    ).length;
    const cancelledCustomers = customersOfPlan.filter(
      (c) => c.status === "cancelled"
    ).length;

    const price = template.priceCents / 100;
    const totalRevenueMonth = activeCustomers * price;

    const churnRatePercent =
      totalCustomers === 0 ? 0 : (cancelledCustomers / totalCustomers) * 100;

    planStats.push({
      planId: template.id,
      activeCustomers,
      totalRevenueMonth,
      churnRatePercent: Number(churnRatePercent.toFixed(1)),
    });
  }

  return { planStats, planCustomersByPlan };
}

// transforma o DTO completo em algo enxuto pro PlanBillingCard
function mapToOwnerCustomerPlan(dto: CustomerPlanDto): OwnerCustomerPlan {
  return {
    id: dto.id,
    customerName: dto.customerName,
    customerPhone: dto.customerPhone,
    status: dto.status,
    lastPaymentStatus: dto.lastPaymentStatus ?? "pending",
    currentCycleStart: dto.currentCycleStart,
    currentCycleEnd: dto.currentCycleEnd,
    visitsUsedInCycle: dto.visitsUsedInCycle ?? 0,
    carryOverVisits: dto.carryOverVisits ?? 0,
    planTemplate: {
      id: dto.planTemplate.id,
      name: dto.planTemplate.name,
      priceCents: dto.planTemplate.priceCents,
      visitsPerInterval: dto.planTemplate.visitsPerInterval,
    },
  };
}

// -------------------- Funções principais usadas pela tela -------------------

export async function fetchOwnerPlans(params: {
  locationId?: string;
}): Promise<OwnerPlansData> {
  const [planTemplatesDto, customerPlansDto] = await Promise.all([
    fetchPlanTemplates(params.locationId),
    fetchCustomerPlans(params.locationId),
  ]);

  const normalizedTemplates = planTemplatesDto.map(normalizePlanTemplate);
  const { planStats, planCustomersByPlan } = buildStatsAndCustomers(
    planTemplatesDto,
    customerPlansDto
  );

  return {
    planTemplates: normalizedTemplates,
    planStats,
    planCustomersByPlan,
  };
}

// usado pelo formulário de criação
export async function createOwnerPlanTemplate(
  input: CreatePlanTemplateInput
): Promise<PlanTemplateUI> {
  const body = {
    locationId: input.locationId,
    name: input.name,
    description: input.description || undefined,
    priceCents: Math.round(input.priceEuro * 100),
    intervalDays: input.intervalDays,
    visitsPerInterval: input.visitsPerInterval ?? undefined,
    sameDayServiceIds: input.sameDayServiceIds ?? [],
    allowedWeekdays: input.allowedWeekdays ?? [],
    minDaysBetweenVisits: input.minDaysBetweenVisits ?? undefined,
    allowedStartTimeMinutes: input.allowedStartTimeMinutes ?? undefined,
    allowedEndTimeMinutes: input.allowedEndTimeMinutes ?? undefined,
  };

  // backend: @Post() em /plan-templates
  const dto = await apiClient<PlanTemplateDto>("/plan-templates", {
    method: "POST",
    body,
  });

  return normalizePlanTemplate(dto);
}
export async function updateOwnerPlanTemplate(
  input: UpdatePlanTemplateInput
): Promise<PlanTemplateUI> {
  const body: any = {};

  if (input.locationId !== undefined) {
    body.locationId = input.locationId;
  }
  if (input.name !== undefined) {
    body.name = input.name;
  }
  if (input.description !== undefined) {
    body.description = input.description;
  }
  if (input.priceEuro !== undefined) {
    body.priceCents = Math.round(input.priceEuro * 100);
  }
  if (input.intervalDays !== undefined) {
    body.intervalDays = input.intervalDays;
  }
  if (input.visitsPerInterval !== undefined) {
    body.visitsPerInterval = input.visitsPerInterval;
  }
  if (input.sameDayServiceIds !== undefined) {
    body.sameDayServiceIds = input.sameDayServiceIds;
  }
  if (input.allowedWeekdays !== undefined) {
    body.allowedWeekdays = input.allowedWeekdays;
  }
  if (input.minDaysBetweenVisits !== undefined) {
    body.minDaysBetweenVisits = input.minDaysBetweenVisits;
  }
  if (input.allowedStartTimeMinutes !== undefined) {
    body.allowedStartTimeMinutes = input.allowedStartTimeMinutes;
  }
  if (input.allowedEndTimeMinutes !== undefined) {
    body.allowedEndTimeMinutes = input.allowedEndTimeMinutes;
  }

  const dto = await apiClient<PlanTemplateDto>(`/plan-templates/${input.id}`, {
    method: "PATCH",
    body,
  });

  return normalizePlanTemplate(dto);
}

// lista de serviços por unidade
export async function fetchOwnerServices(params: {
  locationId?: string;
}): Promise<OwnerService[]> {
  const search = new URLSearchParams();

  // vamos pedir já filtrado por location no backend
  if (params.locationId) {
    search.set("locationId", params.locationId);
    // opcional: aumentar pageSize pra garantir que venham todos
    search.set("pageSize", "100");
  }

  const path =
    search.toString().length > 0
      ? `/services?${search.toString()}`
      : `/services`;

  // backend retorna { items, meta }
  const response = await apiClient<{
    items: ServiceDto[];
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }>(path, { method: "GET" });

  const dtos = response.items ?? [];

  return dtos.map((s) => ({
    id: s.id,
    name: s.name,
    priceEuro: s.priceCents / 100,
  }));
}

// usado pelo PlanBillingCard (server component)
export async function getOwnerCustomerPlans(params?: {
  locationId?: string;
}): Promise<OwnerCustomerPlan[]> {
  const dtos = await fetchCustomerPlans(params?.locationId);
  return dtos.map(mapToOwnerCustomerPlan);
}
