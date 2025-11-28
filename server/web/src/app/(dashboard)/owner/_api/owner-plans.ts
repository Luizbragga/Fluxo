// server/web/src/app/(dashboard)/owner/_api/owner-plans.ts
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

  // mesmo padrão do owner-financeiro/agenda
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
    // quando tiver campo de ativo/inativo no schema, ligamos aqui
    isActive: true,
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

// -------------------- Função principal usada pela tela --------------------

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
