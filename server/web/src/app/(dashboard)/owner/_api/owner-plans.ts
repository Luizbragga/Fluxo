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
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type CustomerPlanStatusDto = string; // "active", "late", "cancelled"...

type CustomerPlanDto = {
  id: string;
  tenantId: string;
  locationId: string;
  planTemplateId: string;
  customerName: string;
  customerPhone: string | null;
  status: CustomerPlanStatusDto;
  currentCycleStart: string;
  currentCycleEnd: string;
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
  startedAt: string;
  status: "active" | "late" | "cancelled" | string;
  nextChargeDate?: string;
  nextChargeAmount?: number;
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
      // por enquanto usamos o início do ciclo como "desde"
      startedAt: cp.currentCycleStart,
      status: cp.status,
      // estimativa simples: próxima cobrança = fim do ciclo atual
      nextChargeDate: cp.currentCycleEnd,
      nextChargeAmount: cp.planTemplate.priceCents / 100,
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

// -------------------- Funções principais usadas pela tela --------------------

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
  };

  const dto = await apiClient<PlanTemplateDto>("/plan-templates", {
    method: "POST",
    body,
  });

  return normalizePlanTemplate(dto);
}

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
