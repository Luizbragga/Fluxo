import { apiClient } from "@/lib/api-client";

export type FinancialSummary = {
  id: string;
  label: string;
  value: string;
  helper?: string;
};

export type ProfessionalEarning = {
  id: string;
  professionalName: string;
  totalAppointments: number;
  totalRevenue: number;
  professionalShare: number;
  spaceShare: number;
};

export type PayoutItemStatus = "pending" | "paid";

export type PayoutItem = {
  id: string;
  professionalName: string;
  periodLabel: string;
  amount: number;
  status: PayoutItemStatus;
};

export type PlanPaymentItemStatus = "pending" | "paid" | "late";

export type PlanPaymentItem = {
  id: string;
  customerName: string;
  planName: string;
  amount: number;
  paidAt?: string;
  dueAt: string;
  status: PlanPaymentItemStatus;
};

export type DailyRevenueItem = {
  date: string; // ISO
  totalRevenue: number; // em euros
};

export type OwnerFinanceiroData = {
  financialSummary: FinancialSummary[];
  professionalEarnings: ProfessionalEarning[];
  payoutItems: PayoutItem[];
  planPayments: PlanPaymentItem[];
  dailyRevenue: DailyRevenueItem[];
};

// Tipos mínimos do que vem da API de relatórios
type ProviderEarningsResponse = {
  from: string;
  to: string;
  totals: {
    servicePriceCents: number;
    providerEarningsCents: number;
    houseEarningsCents: number;
  };
  providers: {
    providerId: string;
    providerName: string;
    servicePriceCents: number;
    providerEarningsCents: number;
    houseEarningsCents: number;
    appointmentsCount?: number;
  }[];
};

type ProviderPayoutsResponse = {
  from: string;
  to: string;
  items: {
    provider?: { id: string; name: string } | null;
    providerEarningsCents: number;
    payoutStatus: "pending" | "paid" | string;
  }[];
};

type PlanPaymentsResponse = {
  from: string;
  to: string;
  totals: {
    amountCents: number;
    paidAmountCents: number;
    pendingAmountCents: number;
    lateAmountCents: number;
    count: number;
  };
  items: {
    id: string;
    customerName: string;
    planName: string;
    amountCents: number;
    status: PlanPaymentItemStatus | string;
    dueDate: string;
    paidAt?: string | null;
  }[];
};

type DailyRevenueResponse = {
  from: string;
  to: string;
  items: {
    date: string;
    totalServicePriceCents: number;
  }[];
};

type RangeParams = {
  from?: string;
  to?: string;
};

function formatShortDate(date: Date) {
  return date.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
  });
}

function buildRangeQuery(params?: RangeParams): string {
  if (!params?.from && !params?.to) return "";
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return `?${qs.toString()}`;
}

// NOVA função: aceita intervalo opcional
export async function fetchOwnerFinanceiroWithRange(
  range?: RangeParams
): Promise<OwnerFinanceiroData> {
  const query = buildRangeQuery(range);

  const [earnings, payouts, planPaymentsResponse, dailyRevenueResponse] =
    await Promise.all([
      apiClient<ProviderEarningsResponse>(
        `/reports/provider-earnings${query}`,
        {
          method: "GET",
        }
      ),
      apiClient<ProviderPayoutsResponse>(`/reports/provider-payouts${query}`, {
        method: "GET",
      }),
      apiClient<PlanPaymentsResponse>(`/reports/plan-payments${query}`, {
        method: "GET",
      }),
      apiClient<DailyRevenueResponse>(`/reports/daily-revenue${query}`, {
        method: "GET",
      }),
    ]);

  const fromDate = new Date(earnings.from);
  const toDate = new Date(earnings.to);

  const totalServicesEuros = Math.round(
    earnings.totals.servicePriceCents / 100
  );
  const providerShareEuros = Math.round(
    earnings.totals.providerEarningsCents / 100
  );
  const houseShareEuros = Math.round(earnings.totals.houseEarningsCents / 100);

  const recurringRevenueEuros = Math.round(
    planPaymentsResponse.totals.paidAmountCents / 100
  );

  // 1) Resumo financeiro
  const financialSummary: FinancialSummary[] = [
    {
      id: "total_revenue",
      label: "Faturamento total (período)",
      value: `€ ${totalServicesEuros}`,
      helper: `Serviços avulsos no período ${formatShortDate(
        fromDate
      )} – ${formatShortDate(toDate)}`,
    },
    {
      id: "space_share",
      label: "Parte do espaço",
      value: `€ ${houseShareEuros}`,
      helper: "Após comissões de profissionais",
    },
    {
      id: "barber_share",
      label: "Parte dos profissionais",
      value: `€ ${providerShareEuros}`,
      helper: "Somatório de comissões",
    },
    {
      id: "recurring_revenue",
      label: "Receita recorrente (planos)",
      value: `€ ${recurringRevenueEuros}`,
      helper: "Pagamentos de planos recebidos no período",
    },
  ];

  // 2) Ganhos por profissional
  const professionalEarnings: ProfessionalEarning[] = earnings.providers.map(
    (p) => ({
      id: p.providerId,
      professionalName: p.providerName,
      totalAppointments: p.appointmentsCount ?? 0,
      totalRevenue: Math.round(p.servicePriceCents / 100),
      professionalShare: Math.round(p.providerEarningsCents / 100),
      spaceShare: Math.round(p.houseEarningsCents / 100),
    })
  );

  // 3) Payouts agregados por profissional
  const byProvider = new Map<
    string,
    {
      providerId: string;
      providerName: string;
      totalProviderEarningsCents: number;
      hasPending: boolean;
      count: number;
    }
  >();

  for (const item of payouts.items) {
    const providerId = item.provider?.id ?? "unknown";
    const providerName = item.provider?.name ?? "Sem profissional";

    let bucket = byProvider.get(providerId);
    if (!bucket) {
      bucket = {
        providerId,
        providerName,
        totalProviderEarningsCents: 0,
        hasPending: false,
        count: 0,
      };
      byProvider.set(providerId, bucket);
    }

    bucket.totalProviderEarningsCents += item.providerEarningsCents;
    bucket.count += 1;

    if (item.payoutStatus !== "paid") {
      bucket.hasPending = true;
    }
  }

  const payoutItems: PayoutItem[] = Array.from(byProvider.values()).map(
    (bucket) => ({
      id: bucket.providerId,
      professionalName: bucket.providerName,
      periodLabel: `Período ${formatShortDate(fromDate)} – ${formatShortDate(
        toDate
      )} · ${bucket.count} atendimentos`,
      amount: Math.round(bucket.totalProviderEarningsCents / 100),
      status: bucket.hasPending ? "pending" : "paid",
    })
  );

  // 4) Pagamentos de planos
  const planPayments: PlanPaymentItem[] = planPaymentsResponse.items.map(
    (p) => ({
      id: p.id,
      customerName: p.customerName,
      planName: p.planName,
      amount: Math.round(p.amountCents / 100),
      status: (p.status as PlanPaymentItemStatus) ?? "pending",
      dueAt: formatShortDate(new Date(p.dueDate)),
      paidAt: p.paidAt ? formatShortDate(new Date(p.paidAt)) : undefined,
    })
  );

  // 5) Faturamento diário
  const dailyRevenue: DailyRevenueItem[] = dailyRevenueResponse.items.map(
    (item) => ({
      date: item.date,
      totalRevenue: Math.round(item.totalServicePriceCents / 100),
    })
  );

  return {
    financialSummary,
    professionalEarnings,
    payoutItems,
    planPayments,
    dailyRevenue,
  };
}

// Função antiga, usada hoje na tela → continua igual
export async function fetchOwnerFinanceiro(): Promise<OwnerFinanceiroData> {
  return fetchOwnerFinanceiroWithRange();
}
