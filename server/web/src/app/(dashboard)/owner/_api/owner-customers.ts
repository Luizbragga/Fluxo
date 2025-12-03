// src/app/(dashboard)/owner/_api/owner-customers.ts

// Quando tivermos o endpoint real /v1/customers,
// aqui vai virar chamada à API. Por enquanto é só mock.

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
  customerId: string;
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
  date: string; // "18 Nov 2025" (texto para exibir)
  time: string; // "09:00"
  professionalName: string;
  serviceName: string;
  source: "plan" | "single" | "walk_in" | "app";
  status: "done" | "no_show" | "cancelled";

  // NOVOS CAMPOS para perfil financeiro (mock-only por enquanto)
  price: number; // valor da visita em euros
  year: number; // ano numérico (2025, 2024…)
  month: number; // 1-12 (1=Jan, 11=Nov, etc.)
};

// ---- MOCKS POR ENQUANTO ------------------------------------

const customersMock: OwnerCustomer[] = [
  {
    id: "1",
    name: "Miguel Silva",
    phone: "+351 912 345 678",
    hasActivePlan: true,
    planName: "Plano Corte Mensal",
    lastVisitDate: "18 Nov 2025",
    nextVisitDate: "02 Dez 2025",
    totalVisits: 14,
  },
  {
    id: "2",
    name: "Bianca Costa",
    phone: "+351 934 222 111",
    hasActivePlan: true,
    planName: "Plano Nails Premium",
    lastVisitDate: "20 Nov 2025",
    nextVisitDate: "27 Nov 2025",
    totalVisits: 9,
  },
  {
    id: "3",
    name: "Carlos Andrade",
    phone: "+351 968 555 000",
    hasActivePlan: false,
    lastVisitDate: "05 Nov 2025",
    totalVisits: 3,
  },
];

const customerPlansMock: OwnerCustomerPlan[] = [
  {
    customerId: "1",
    planName: "Plano Corte Mensal",
    status: "active",
    visitsUsed: 2,
    visitsTotal: 4,
    renewsAt: "02 Jan 2026",
    nextChargeAmount: 45,
  },
  {
    customerId: "2",
    planName: "Plano Nails Premium",
    status: "active",
    visitsUsed: 3,
    visitsTotal: 6,
    renewsAt: "27 Dez 2025",
    nextChargeAmount: 65,
  },
  {
    customerId: "3",
    planName: "",
    status: "none",
    visitsUsed: 0,
    visitsTotal: 0,
  },
];

const appointmentHistoryMock: OwnerCustomerAppointmentHistory[] = [
  {
    id: "h1",
    customerId: "1",
    date: "18 Nov 2025",
    time: "09:00",
    professionalName: "Rafa Barber",
    serviceName: "Corte + Barba",
    source: "plan",
    status: "done",
    price: 25,
    year: 2025,
    month: 11,
  },
  {
    id: "h2",
    customerId: "1",
    date: "04 Nov 2025",
    time: "18:30",
    professionalName: "João Fade",
    serviceName: "Corte masculino",
    source: "single",
    status: "done",
    price: 15,
    year: 2025,
    month: 11,
  },
  {
    id: "h3",
    customerId: "2",
    date: "20 Out 2025",
    time: "15:00",
    professionalName: "Ana Nails",
    serviceName: "Manicure gel",
    source: "plan",
    status: "done",
    price: 30,
    year: 2025,
    month: 10,
  },
  {
    id: "h4",
    customerId: "3",
    date: "05 Set 2025",
    time: "19:00",
    professionalName: "Rafa Barber",
    serviceName: "Corte masculino",
    source: "walk_in",
    status: "done",
    price: 15,
    year: 2025,
    month: 9,
  },
];

// Função única de fetch que a página usa.
// Depois a gente troca por chamada real à API.
export async function fetchOwnerCustomers(): Promise<{
  customers: OwnerCustomer[];
  plans: OwnerCustomerPlan[];
  history: OwnerCustomerAppointmentHistory[];
}> {
  return {
    customers: customersMock,
    plans: customerPlansMock,
    history: appointmentHistoryMock,
  };
}
