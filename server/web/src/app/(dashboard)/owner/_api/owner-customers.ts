// src/app/(dashboard)/owner/_api/owner-customers.ts
import { apiClient } from "@/lib/api-client";

export type OwnerCustomer = {
  id: string;
  name: string;
  phone: string;
  hasActivePlan: boolean;
  planName?: string;
  lastVisitDate?: string; // "18 Nov 2025"
  nextVisitDate?: string; // "02 Dez 2025"
  totalVisits: number;
};

export type OwnerCustomerPlan = {
  id: string; // ID real do customerPlan
  customerId: string; // telefone normalizado como “chave lógica”
  planName: string;
  status: "active" | "paused" | "cancelled" | "none";
  visitsUsed: number;
  visitsTotal: number;
  renewsAt?: string;
  nextChargeAmount?: number;
};

export type OwnerCustomerAppointmentHistory = {
  id: string;
  customerId: string;
  date: string; // "18 Nov 2025"
  time: string; // "09:00"
  professionalName: string;
  serviceName: string;
  source: "plan" | "single" | "walk_in" | "app";
  status: "done" | "no_show" | "cancelled";

  // para o perfil financeiro (por enquanto ainda mock vazio)
  price: number;
  year: number;
  month: number;
};

type BackendCustomer = {
  name: string;
  phone: string;
  hasActivePlan: boolean;
  planName?: string;
  lastVisitDate?: string;
  nextVisitDate?: string;
  totalVisits: number;
};

type BackendCustomerPlan = {
  id: string;
  customerName: string;
  customerPhone: string;
  status: "active" | "suspended" | "late" | "cancelled";
  currentCycleEnd: string;
  visitsUsedInCycle: number;
  planTemplate: {
    name: string;
    visitsPerInterval?: number | null;
  };
};

const normalizePhone = (phone: string) => phone.replace(/\D+/g, "");

// Busca clientes + planos em chamadas separadas
export async function fetchOwnerCustomers(): Promise<{
  customers: OwnerCustomer[];
  plans: OwnerCustomerPlan[];
  history: OwnerCustomerAppointmentHistory[];
}> {
  const [customersResponse, plansResponse] = await Promise.all([
    apiClient<{ customers: BackendCustomer[] }>("/owner/customers", {
      method: "GET",
    }),
    apiClient<BackendCustomerPlan[]>("/plans/customer-plans", {
      method: "GET",
    }),
  ]);

  const backendCustomers = customersResponse.customers ?? [];

  const customers: OwnerCustomer[] = backendCustomers.map((c) => {
    const id = normalizePhone(c.phone);

    return {
      id,
      name: c.name,
      phone: c.phone,
      hasActivePlan: c.hasActivePlan,
      planName: c.planName,
      lastVisitDate: c.lastVisitDate,
      nextVisitDate: c.nextVisitDate,
      totalVisits: c.totalVisits,
    };
  });

  const plans: OwnerCustomerPlan[] = plansResponse.map((p) => {
    const customerId = normalizePhone(p.customerPhone);

    return {
      id: p.id,
      customerId,
      planName: p.planTemplate?.name ?? "",
      status: p.status === "active" ? "active" : "none",
      visitsUsed: p.visitsUsedInCycle ?? 0,
      visitsTotal: p.planTemplate?.visitsPerInterval ?? 0,
      renewsAt: new Date(p.currentCycleEnd).toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      nextChargeAmount: undefined,
    };
  });

  // por enquanto seguimos sem histórico real
  const history: OwnerCustomerAppointmentHistory[] = [];

  return { customers, plans, history };
}

export async function registerCustomerPlanPayment(params: {
  customerPlanId: string;
  amountCents: number;
  paidAt?: string; // "YYYY-MM-DD"
}) {
  await apiClient(`/plans/customer-plans/${params.customerPlanId}/pay`, {
    method: "POST",
    body: {
      amountCents: params.amountCents,
      paidAt: params.paidAt,
    },
  });
}
