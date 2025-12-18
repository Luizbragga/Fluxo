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

// ----------------- Tipos mínimos das respostas de /reports -----------------

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
    date: string;
    totalServicePriceCents: number;
  }[];
};

function getRangeDates(preset: ReportsRangePreset): {
  from: string;
  to: string;
} {
  const now = new Date();

  // fim = amanhã 00:00 UTC (porque backend usa gte from, lt to)
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

  if (preset === "last_30_days")
    start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  else if (preset === "last_90_days")
    start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
  else start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);

  return { from: start.toISOString(), to: end.toISOString() };
}

function buildMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("pt-PT", { month: "short", year: "numeric" });
}

/**
 * Busca dados financeiros brutos nos endpoints de /reports
 * e devolve linhas agregadas por mês para a tabela.
 */
export async function fetchOwnerMonthlyFinancial(
  preset: ReportsRangePreset,
  opts?: { locationId?: string; providerId?: string }
): Promise<MonthlyFinancialRow[]> {
  const { from, to } = getRangeDates(preset);

  const qs = new URLSearchParams({ from, to });
  if (opts?.locationId) qs.set("locationId", opts.locationId);
  if (opts?.providerId) qs.set("providerId", opts.providerId);
  const query = qs.toString();

  const [earnings, dailyRevenue] = await Promise.all([
    apiClient<ProviderEarningsResponse>(`/reports/provider-earnings?${query}`, {
      method: "GET",
    }),
    apiClient<DailyRevenueResponse>(`/reports/daily-revenue?${query}`, {
      method: "GET",
    }),
  ]);

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
  totalRevenue: number;
  providerEarnings: number;
  houseEarnings: number;
  appointmentsCount: number;
  occupationPercentage: number;
  averageTicket: number;
  workedMinutes: number;
  availableMinutes: number;
};

export type ProviderEarningsDetailedResult = {
  totals: {
    totalRevenue: number;
    totalProviderEarnings: number;
    totalHouseEarnings: number;
  };
  items: ProviderEarningRow[];
};

export async function fetchOwnerProviderEarningsDetailed(
  preset: ReportsRangePreset,
  opts?: { locationId?: string; providerId?: string }
): Promise<ProviderEarningsDetailedResult> {
  const { from, to } = getRangeDates(preset);

  const params = new URLSearchParams({ from, to });
  if (opts?.locationId) params.set("locationId", opts.locationId);
  if (opts?.providerId) params.set("providerId", opts.providerId);

  const data = await apiClient<ProviderEarningsResponse>(
    `/reports/provider-earnings?${params.toString()}`,
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
      workedMinutes: p.workedMinutes,
      availableMinutes: p.availableMinutes,
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

function buildReportsRangeParams(
  preset: ReportsRangePreset
): Record<string, string> {
  const now = new Date();
  let fromDate: Date;

  switch (preset) {
    case "last_30_days":
      fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "last_90_days":
      fromDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "last_12_months":
    default:
      fromDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
  }

  return { from: fromDate.toISOString(), to: now.toISOString() };
}

export async function fetchOwnerCancellations(
  preset: ReportsRangePreset,
  filter: "all" | "cancelled" | "no_show" = "all",
  opts?: { locationId?: string; providerId?: string }
): Promise<CancellationItem[]> {
  const params = buildReportsRangeParams(preset);

  if (filter === "cancelled" || filter === "no_show") params.type = filter;
  if (opts?.locationId) params.locationId = opts.locationId;
  if (opts?.providerId) params.providerId = opts.providerId;

  const query = new URLSearchParams(params).toString();

  const data = await apiClient<CancellationsApiResponse>(
    `/reports/cancellations?${query}`,
    {
      method: "GET",
    }
  );

  return data.items ?? [];
}

// ----------------- ✅ Payouts (detalhado por atendimento) -----------------

export type ProviderPayoutsStatusFilter = "pending" | "paid" | "all";

export type ProviderPayoutItem = {
  earningId: string;
  appointmentId: string;
  date: string;

  customerName: string | null;

  serviceName: string;
  servicePriceCents: number;
  commissionPercentage: number;
  providerEarningsCents: number;
  houseEarningsCents: number;

  provider: { id: string; name: string } | null;
  location: { id: string; name: string } | null;

  payoutStatus: "pending" | "paid" | string;
  payoutAt?: string | null;
  payoutMethod?: string | null;
  payoutNote?: string | null;
};

export type ProviderPayoutsResponse = {
  from: string;
  to: string;
  filters: {
    locationId: string | null;
    providerId: string | null;
    status: string | null;
  };
  totals: {
    servicePriceCents: number;
    providerEarningsCents: number;
    houseEarningsCents: number;
    count: number;
  };
  items: ProviderPayoutItem[];
};

export async function fetchOwnerProviderPayoutsDetailed(params: {
  from: string;
  to: string;
  status?: ProviderPayoutsStatusFilter;
  locationId?: string;
  providerId?: string;
}): Promise<ProviderPayoutsResponse> {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
  });

  // ✅ não envia status se for "all"
  if (params.status && params.status !== "all") qs.set("status", params.status);

  if (params.locationId) qs.set("locationId", params.locationId);
  if (params.providerId) qs.set("providerId", params.providerId);

  return apiClient<ProviderPayoutsResponse>(
    `/reports/provider-payouts?${qs.toString()}`,
    {
      method: "GET",
    }
  );
}
export type AppointmentsOverviewStatus =
  | "scheduled"
  | "in_service"
  | "done"
  | "no_show"
  | "cancelled"
  | string;

export type AppointmentsOverviewItem = {
  id: string;
  date: string; // YYYY-MM-DD (ou ISO, depende do backend)
  time: string; // "HH:mm"
  serviceName: string;
  customerName: string;
  status: AppointmentsOverviewStatus;
  billingType?: "plan" | "single" | string;
  professionalId?: string;
  professionalName?: string;
  locationId?: string | null;
};

export type AppointmentsOverviewDay = {
  date: string; // YYYY-MM-DD
  stats?: {
    total?: number;
    planCount?: number;
    avulsoCount?: number;
    scheduled?: number;
    inService?: number;
    done?: number;
    noShow?: number;
    cancelled?: number;
  };
  items?: AppointmentsOverviewItem[];
};

export type AppointmentsOverviewResponse = {
  from: string;
  to: string;
  // backend pode mandar "days" ou "items" agregados — deixei tolerante
  days?: AppointmentsOverviewDay[];
  items?: AppointmentsOverviewItem[];
};

export async function fetchOwnerAppointmentsOverview(params: {
  from: string;
  to: string;
  locationId?: string;
  providerId?: string;
}): Promise<AppointmentsOverviewResponse> {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
  });

  if (params.locationId) qs.set("locationId", params.locationId);
  if (params.providerId) qs.set("providerId", params.providerId);

  return apiClient<AppointmentsOverviewResponse>(
    `/reports/appointments-overview?${qs.toString()}`,
    { method: "GET" }
  );
}
// ----------------- Services Report -----------------

export type ServicesReportResponse = {
  range: {
    from: string | null;
    to: string | null;
  };
  filters: {
    locationId: string | null;
    providerId: string | null;
    serviceId: string | null;
  };
  kpis: {
    appointmentsDone: number;
    revenueCents: number;
    avgTicketCents: number;
    uniqueCustomers: number;
    providerEarningsCents: number;
    houseEarningsCents: number;
  };
  services: Array<{
    serviceId: string;
    name: string;
    category: string | null;
    appointmentsDone: number;
    revenueCents: number;
    avgTicketCents: number;
    avgDurationMin: number;
    shareAppointments: number;
    shareRevenue: number;
    providerEarningsCents: number;
    houseEarningsCents: number;
  }>;
  series: {
    byDay: Array<{
      day: string; // "YYYY-MM-DD"
      appointments: number;
      revenueCents: number;
    }>;
  };
};

export async function fetchOwnerServicesReport(params?: {
  from?: string;
  to?: string;
  locationId?: string;
  providerId?: string;
  serviceId?: string;
}): Promise<ServicesReportResponse> {
  const qs = new URLSearchParams();

  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.locationId) qs.set("locationId", params.locationId);
  if (params?.providerId) qs.set("providerId", params.providerId);
  if (params?.serviceId) qs.set("serviceId", params.serviceId);

  // ✅ segue o mesmo padrão dos outros endpoints (apiClient já cuida do /v1)
  const url = `/reports/services${qs.toString() ? `?${qs.toString()}` : ""}`;

  return apiClient<ServicesReportResponse>(url, { method: "GET" });
}
