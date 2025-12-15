// src/app/(dashboard)/owner/_api/owner-reports.ts

import { apiClient } from "@/lib/api-client";

export type ReportsRangePreset =
  | "last_30_days"
  | "last_90_days"
  | "last_12_months";

export type MonthlyFinancialRow = {
  monthLabel: string;
  totalRevenue: number;
  spaceShare: number;
  professionalsShare: number;
  estimatedLossNoShow: number;
};

// Tipos mínimos das respostas de /reports

type ProviderEarningsProviderItem = {
  providerId: string;
  providerName: string;
  location: { id: string; name: string } | null;
  servicePriceCents: number;
  providerEarningsCents: number;
  houseEarningsCents: number;
  appointmentsCount: number;
  workedMinutes: number;
  availableMinutes: number;
  occupationPercentage: number;
};

type ProviderEarningsResponse = {
  from: string;
  to: string;
  totals: {
    servicePriceCents: number;
    providerEarningsCents: number;
    houseEarningsCents: number;
  };
  providers: ProviderEarningsProviderItem[];
};

type DailyRevenueResponse = {
  from: string;
  to: string;
  items: {
    date: string; // ISO
    totalServicePriceCents: number;
  }[];
};

function getRangeDates(preset: ReportsRangePreset): {
  from: string;
  to: string;
} {
  const now = new Date();

  // fim = amanhã 00:00 UTC (porque o backend usa gte from, lt to)
  const end = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0
    )
  );

  let start = new Date(end);

  if (preset === "last_30_days") {
    start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (preset === "last_90_days") {
    start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
  } else {
    // last_12_months ~ 365 dias
    start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
  }

  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

function buildMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-11
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("pt-PT", {
    month: "short",
    year: "numeric",
  });
}

/**
 * Busca dados financeiros brutos nos endpoints de /reports
 * e devolve linhas agregadas por mês para a tabela "Relatório financeiro mensal".
 */
export async function fetchOwnerMonthlyFinancial(
  preset: ReportsRangePreset
): Promise<MonthlyFinancialRow[]> {
  const { from, to } = getRangeDates(preset);
  const query = new URLSearchParams({ from, to }).toString();

  const [earnings, dailyRevenue] = await Promise.all([
    apiClient<ProviderEarningsResponse>(`/reports/provider-earnings?${query}`, {
      method: "GET",
    }),
    apiClient<DailyRevenueResponse>(`/reports/daily-revenue?${query}`, {
      method: "GET",
    }),
  ]);

  // 1) Agrupar faturamento diário por mês (YYYY-MM)
  type MonthBucket = {
    monthLabel: string;
    monthStartDate: Date;
    totalServicePriceCents: number;
  };

  const byMonth = new Map<string, MonthBucket>();

  for (const item of dailyRevenue.items ?? []) {
    const d = new Date(item.date);
    const key = buildMonthKey(d);

    let bucket = byMonth.get(key);
    if (!bucket) {
      bucket = {
        monthLabel: formatMonthLabel(d),
        monthStartDate: new Date(
          Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
        ),
        totalServicePriceCents: 0,
      };
      byMonth.set(key, bucket);
    }

    bucket.totalServicePriceCents += item.totalServicePriceCents;
  }

  const totalServicePriceCents = earnings.totals.servicePriceCents;
  const totalProviderEarningsCents = earnings.totals.providerEarningsCents;
  const totalHouseEarningsCents = earnings.totals.houseEarningsCents;

  // 2) Converter buckets em linhas da tabela,
  // distribuindo parte do espaço / profissionais proporcionalmente
  const rows: MonthlyFinancialRow[] = Array.from(byMonth.values())
    .sort((a, b) => b.monthStartDate.getTime() - a.monthStartDate.getTime())
    .map((bucket) => {
      const proportion =
        totalServicePriceCents > 0
          ? bucket.totalServicePriceCents / totalServicePriceCents
          : 0;

      const spaceShareCents = Math.round(totalHouseEarningsCents * proportion);
      const professionalsShareCents = Math.round(
        totalProviderEarningsCents * proportion
      );

      return {
        monthLabel: bucket.monthLabel,
        totalRevenue: bucket.totalServicePriceCents / 100,
        spaceShare: spaceShareCents / 100,
        professionalsShare: professionalsShareCents / 100,
        // ainda não temos cálculo real de perda com no-show no backend
        estimatedLossNoShow: 0,
      };
    });

  return rows;
}
// ----------------- Detalhamento por profissional -----------------

export type ProviderEarningRow = {
  providerId: string;
  providerName: string;
  locationName: string | null;
  totalRevenue: number; // € serviços
  providerEarnings: number; // € comissão profissional
  houseEarnings: number; // € casa
  appointmentsCount: number;
  occupationPercentage: number; // 0–100
  averageTicket: number; // € por atendimento
};

export type ProviderEarningsDetailedResult = {
  totals: {
    totalRevenue: number;
    totalProviderEarnings: number;
    totalHouseEarnings: number;
  };
  items: ProviderEarningRow[];
};

/**
 * Busca /reports/provider-earnings e já converte
 * tudo de cents -> euros + métricas derivadas por profissional.
 */
export async function fetchOwnerProviderEarningsDetailed(
  preset: ReportsRangePreset
): Promise<ProviderEarningsDetailedResult> {
  const { from, to } = getRangeDates(preset);
  const query = new URLSearchParams({ from, to }).toString();

  const data = await apiClient<ProviderEarningsResponse>(
    `/reports/provider-earnings?${query}`,
    { method: "GET" }
  );

  const totals = {
    totalRevenue: data.totals.servicePriceCents / 100,
    totalProviderEarnings: data.totals.providerEarningsCents / 100,
    totalHouseEarnings: data.totals.houseEarningsCents / 100,
  };

  const items: ProviderEarningRow[] = (data.providers ?? []).map((p) => {
    const totalRevenue = p.servicePriceCents / 100;
    const providerEarnings = p.providerEarningsCents / 100;
    const houseEarnings = p.houseEarningsCents / 100;
    const averageTicket =
      p.appointmentsCount > 0 ? totalRevenue / p.appointmentsCount : 0;

    return {
      providerId: p.providerId,
      providerName: p.providerName,
      locationName: p.location?.name ?? null,
      totalRevenue,
      providerEarnings,
      houseEarnings,
      appointmentsCount: p.appointmentsCount,
      occupationPercentage: p.occupationPercentage,
      averageTicket,
    };
  });

  return { totals, items };
}

// ----------------- Cancelamentos / no-shows -----------------

export type CancellationItem = {
  id: string;
  date: string;
  status: "cancelled" | "no_show";
  customerName: string | null;
  professionalName: string | null;
  serviceName: string | null;
  reason: string | null;
};

type CancellationsApiResponse = {
  from: string;
  to: string;
  items: CancellationItem[];
};

/**
 * Usa o mesmo conceito de presets de período da tela (30d, 90d, 12 meses)
 * e converte para from/to em ISO pra mandar pro backend.
 */
function buildReportsRangeParams(
  preset: ReportsRangePreset
): Record<string, string> {
  const now = new Date();
  let fromDate: Date;

  switch (preset) {
    case "last_30_days": {
      fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    }
    case "last_90_days": {
      fromDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    }
    case "last_12_months":
    default: {
      fromDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    }
  }

  return {
    from: fromDate.toISOString(),
    to: now.toISOString(),
  };
}

/**
 * Busca cancelamentos e no-shows do período.
 * filter:
 *  - "all"        -> não manda 'type' na query (vem tudo)
 *  - "cancelled"  -> type=cancelled
 *  - "no_show"    -> type=no_show
 */
export async function fetchOwnerCancellations(
  preset: ReportsRangePreset,
  filter: "all" | "cancelled" | "no_show" = "all"
): Promise<CancellationItem[]> {
  const params = buildReportsRangeParams(preset);

  if (filter === "cancelled" || filter === "no_show") {
    params.type = filter;
  }

  const query = new URLSearchParams(params).toString();

  const data = await apiClient<CancellationsApiResponse>(
    `/reports/cancellations?${query}`,
    { method: "GET" }
  );

  return data.items ?? [];
}
