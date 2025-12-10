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
  id: string; // ID real do customerPlan (view)
  customerId: string; // mesmo ID usado em OwnerCustomer.id
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

  price: number;
  year: number;
  month: number;
};

// TIPOS QUE REPRESENTAM EXATAMENTE O QUE O BACKEND ENVIA
type BackendCustomersResponse = {
  customers: {
    id: string;
    name: string;
    phone: string;
    hasActivePlan: boolean;
    planName?: string;
    lastVisitDate?: string;
    nextVisitDate?: string;
    totalVisits: number;
  }[];
  plans: {
    id: string;
    customerId: string;
    planName: string;
    status: "active" | "suspended" | "late" | "cancelled";
    visitsUsed: number;
    visitsTotal: number;
    renewsAt?: string;
    nextChargeAmount: number | null;
  }[];
  history: {
    id: string;
    customerId: string;
    date: string;
    time: string;
    professionalName: string;
    serviceName: string;
    source: "plan" | "single";
    status: "done" | "no_show" | "cancelled";
    price: number;
    year: number;
    month: number;
  }[];
};

// Busca clientes + planos + histórico em UMA chamada ao backend
export async function fetchOwnerCustomers(): Promise<{
  customers: OwnerCustomer[];
  plans: OwnerCustomerPlan[];
  history: OwnerCustomerAppointmentHistory[];
}> {
  const data = await apiClient<BackendCustomersResponse>("/owner/customers", {
    method: "GET",
  });

  const backendCustomers = data.customers ?? [];
  const backendPlans = data.plans ?? [];
  const backendHistory = data.history ?? [];

  // -----------------------------
  // CUSTOMERS
  // -----------------------------
  const customers: OwnerCustomer[] = backendCustomers.map((c) => ({
    id: c.id, // <-- agora usamos o id real enviado pelo backend
    name: c.name,
    phone: c.phone,
    hasActivePlan: c.hasActivePlan,
    planName: c.planName,
    lastVisitDate: c.lastVisitDate,
    nextVisitDate: c.nextVisitDate,
    totalVisits: c.totalVisits,
  }));

  // -----------------------------
  // PLANS
  // -----------------------------
  const plans: OwnerCustomerPlan[] = backendPlans.map((p) => ({
    id: p.id,
    customerId: p.customerId, // <-- mesmo ID que OwnerCustomer.id
    planName: p.planName,
    // comprimimos os estados do backend em "active" | "none" como antes
    status: p.status === "active" ? "active" : "none",
    visitsUsed: p.visitsUsed ?? 0,
    visitsTotal: p.visitsTotal ?? 0,
    renewsAt: p.renewsAt,
    nextChargeAmount:
      typeof p.nextChargeAmount === "number" ? p.nextChargeAmount : undefined,
  }));

  // -----------------------------
  // HISTORY
  // -----------------------------
  const history: OwnerCustomerAppointmentHistory[] = backendHistory.map(
    (h) => ({
      id: h.id,
      customerId: h.customerId, // <-- já vem alinhado com customers[].id
      date: h.date,
      time: h.time,
      professionalName: h.professionalName,
      serviceName: h.serviceName,
      source: h.source,
      status: h.status,
      price: h.price,
      year: h.year,
      month: h.month,
    })
  );

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
