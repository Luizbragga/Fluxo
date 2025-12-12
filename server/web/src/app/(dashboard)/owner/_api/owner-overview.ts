// src/app/(dashboard)/owner/_api/owner-overview.ts

import type { OverviewKpi } from "../_components/overview-kpi-card";
import type { NextAppointment } from "../_components/next-appointment-card";
import type { ProfessionalPayout } from "../_components/professional-payout-row";

import { fetchOwnerAgendaDay, type OwnerAgendaDay } from "./owner-agenda";
import { fetchOwnerPlans, type OwnerPlansData } from "./owner-plans";
import {
  fetchOwnerFinanceiroWithRange,
  type OwnerFinanceiroData,
} from "./owner-financeiro";

// ---------------------- Tipos locais ----------------------

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

// ---------------------- MOCK (continua disponível) --------

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

// ---------------------- Helpers internos ------------------

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatEuro(amount: number): string {
  if (!Number.isFinite(amount)) return "€ 0";
  return `€ ${amount.toFixed(0)}`;
}

/**
 * Hoje em UTC:
 * - ymd: "YYYY-MM-DD" (para agenda)
 * - fromISO / toISO: intervalo [00:00, 24:00) UTC para relatórios
 */
function getTodayRangeUTC(): {
  ymd: string;
  fromISO: string;
  toISO: string;
} {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  const from = new Date(Date.UTC(y, m, d, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, d + 1, 0, 0, 0));

  const ymd = `${y}-${pad2(m + 1)}-${pad2(d)}`;

  return {
    ymd,
    fromISO: from.toISOString(),
    toISO: to.toISOString(),
  };
}

function buildOverviewKpis(args: {
  appointmentsToday: number;
  expectedRevenueToday: number;
  totalActivePlans: number;
  totalMrr: number;
  toPayProfessionals: number;
}): OverviewKpi[] {
  const {
    appointmentsToday,
    expectedRevenueToday,
    totalActivePlans,
    totalMrr,
    toPayProfessionals,
  } = args;

  return [
    {
      id: "appointments_today",
      title: "Agendamentos de hoje",
      value: String(appointmentsToday),
      helper: appointmentsToday > 0 ? "" : "Sem horários marcados até agora",
      tone: appointmentsToday > 0 ? "positive" : "neutral",
    },
    {
      id: "expected_revenue_today",
      title: "Receita prevista hoje",
      value: formatEuro(expectedRevenueToday),
      helper: "Serviços e planos concluídos / pagos hoje",
      tone: expectedRevenueToday > 0 ? "positive" : "neutral",
    },
    {
      id: "active_plans",
      title: "Planos ativos",
      value: String(totalActivePlans),
      helper: `${formatEuro(totalMrr)} / mês recorrente`,
      tone: totalActivePlans > 0 ? "positive" : "neutral",
    },
    {
      id: "to_pay_professionals",
      title: "A pagar aos profissionais",
      value: formatEuro(toPayProfessionals),
      helper:
        toPayProfessionals > 0
          ? "Repasses pendentes no mês"
          : "Nenhum repasse pendente",
      tone: toPayProfessionals > 0 ? "neutral" : "positive",
    },
  ];
}

function buildNextAppointments(agenda: OwnerAgendaDay): NextAppointment[] {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const upcoming = agenda.appointments
    .filter((a) => a.startMinutes >= nowMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes)
    .slice(0, 3);

  return upcoming.map<NextAppointment>((a) => ({
    id: a.id,
    time: a.time,
    title: a.serviceName,
    detail: `${a.customerName} · ${
      a.billingType === "plan" ? "Plano" : "Avulso"
    }`,
    // usamos "plan" para planos, "walk_in" para o resto (ícone genérico)
    source: a.billingType === "plan" ? "plan" : "walk_in",
  }));
}

function buildQuickFinancialCards(
  fin: OwnerFinanceiroData
): QuickFinancialCard[] {
  const plansRevenueMonth = fin.planPayments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);

  const servicesRevenueMonth = fin.dailyRevenue.reduce(
    (sum, d) => sum + d.totalRevenue,
    0
  );

  return [
    {
      id: "plans_revenue",
      title: "Receita de planos (mês)",
      value: formatEuro(plansRevenueMonth),
      helper: "Pagamentos de planos recebidos no mês",
      accent: "positive",
    },
    {
      id: "single_services_revenue",
      title: "Serviços avulsos (mês)",
      value: formatEuro(servicesRevenueMonth),
      helper: "Serviços concluídos no mês (sem produtos)",
      accent: "neutral",
    },
  ];
}

// ---------------------- Função principal ------------------

export async function fetchOwnerOverview(): Promise<OwnerOverviewData> {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK_OVERVIEW === "1";

  // modo demo / offline
  if (useMock) {
    return ownerOverviewMock;
  }

  const { ymd: todayYmd, fromISO, toISO } = getTodayRangeUTC();

  // mês atual (padrão dos relatórios) + hoje isolado
  const [agendaDay, plansData, financeiroMonth, financeiroToday] =
    await Promise.all([
      fetchOwnerAgendaDay(todayYmd),
      fetchOwnerPlans({}),
      fetchOwnerFinanceiroWithRange(), // mês atual
      fetchOwnerFinanceiroWithRange({ from: fromISO, to: toISO }), // hoje
    ]);

  // --- KPI 1: agendamentos de hoje ---
  const appointmentsToday = agendaDay.appointments.length;

  // --- KPI 2: receita prevista hoje (serviços + planos do dia) ---
  const revenueServicesToday = financeiroToday.dailyRevenue.reduce(
    (sum, d) => sum + d.totalRevenue,
    0
  );

  const revenuePlansToday = financeiroToday.planPayments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);

  const expectedRevenueToday = revenueServicesToday + revenuePlansToday;

  // --- KPI 3: planos ativos + MRR ---
  const totalActivePlans = plansData.planStats.reduce(
    (sum, s) => sum + s.activeCustomers,
    0
  );

  const totalMrr = plansData.planStats.reduce(
    (sum, s) => sum + s.totalRevenueMonth,
    0
  );

  // --- KPI 4: a pagar aos profissionais (pendente no mês) ---
  const toPayProfessionals = financeiroMonth.payoutItems
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + p.amount, 0);

  const overviewKpis = buildOverviewKpis({
    appointmentsToday,
    expectedRevenueToday,
    totalActivePlans,
    totalMrr,
    toPayProfessionals,
  });

  const nextAppointments = buildNextAppointments(agendaDay);

  const quickFinancialCards = buildQuickFinancialCards(financeiroMonth);

  // payoutItems tem exatamente o mesmo shape de ProfessionalPayout
  const professionalPayouts =
    financeiroMonth.payoutItems as ProfessionalPayout[];

  return {
    overviewKpis,
    nextAppointments,
    quickFinancialCards,
    professionalPayouts,
  };
}
