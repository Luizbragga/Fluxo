// src/app/(dashboard)/owner/_api/owner-overview.ts

import type { OverviewKpi } from "../_components/overview-kpi-card";
import type { NextAppointment } from "../_components/next-appointment-card";
import type { ProfessionalPayout } from "../_components/professional-payout-row";
// deixamos pronto pro futuro; por enquanto não usamos
import { apiClient } from "@/lib/api-client";

export type QuickFinancialCard = {
  id: string;
  title: string;
  value: string;
  helper: string;
  accent?: "positive" | "neutral";
};

export type OwnerOverviewData = {
  overviewKpis: OverviewKpi[];
  nextAppointments: NextAppointment[];
  quickFinancialCards: QuickFinancialCard[];
  professionalPayouts: ProfessionalPayout[];
};

export const ownerOverviewMock: OwnerOverviewData = {
  overviewKpis: [
    {
      id: "appointments_today",
      title: "Agendamentos de hoje",
      value: "18",
      helper: "+4 vs. mesma hora ontem",
      tone: "positive",
    },
    {
      id: "expected_revenue_today",
      title: "Receita prevista hoje",
      value: "€ 540",
      helper: "Inclui serviços avulsos e planos",
      tone: "neutral",
    },
    {
      id: "active_plans",
      title: "Planos ativos",
      value: "27",
      helper: "€ 1.350 / mês recorrente",
      tone: "positive",
    },
    {
      id: "to_pay_professionals",
      title: "A pagar aos profissionais",
      value: "€ 210",
      helper: "Próxima semana",
      tone: "neutral",
    },
  ],
  nextAppointments: [
    {
      id: "1",
      time: "09:00",
      title: "Corte masculino",
      detail: "Cliente 50 por cento · Rafa Barber",
      source: "plan",
    },
    {
      id: "2",
      time: "09:30",
      title: "Barba express",
      detail: "Walk-in · Caixa",
      source: "walk_in",
    },
    {
      id: "3",
      time: "10:00",
      title: "Corte + Barba",
      detail: "Miguel · Agendado app",
      source: "app",
    },
  ],
  quickFinancialCards: [
    {
      id: "plans_revenue",
      title: "Receita de planos (mês)",
      value: "€ 1.350",
      helper: "+3 novos planos esta semana",
      accent: "positive",
    },
    {
      id: "single_services_revenue",
      title: "Serviços avulsos (mês)",
      value: "€ 980",
      helper: "sem contas de produtos incluídas",
      accent: "neutral",
    },
  ],
  professionalPayouts: [
    {
      id: "rafa",
      professionalName: "Rafa Barber",
      periodLabel: "Período 18–24 Nov · 12 atendimentos",
      amount: 210,
      status: "pending",
    },
    {
      id: "joao",
      professionalName: "João Fade",
      periodLabel: "Período 11–17 Nov · pago",
      amount: 180,
      status: "paid",
    },
  ],
};

export async function fetchOwnerOverview(): Promise<OwnerOverviewData> {
  const useMock =
    process.env.NEXT_PUBLIC_USE_MOCK_OVERVIEW === "1" ||
    typeof window === "undefined";

  if (useMock) {
    return ownerOverviewMock;
  }

  // por enquanto ainda mock; depois ligamos no Nest com apiClient
  return ownerOverviewMock;

  // exemplo de futuro:
  // const data = await apiClient<BackendOwnerOverviewDto>("/owner/overview");
  // return mapBackendOverviewToFront(data);
}
