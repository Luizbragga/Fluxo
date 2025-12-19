// src/app/(dashboard)/owner/relatorios/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  fetchOwnerMonthlyFinancial,
  type MonthlyFinancialRow,
  type ReportsRangePreset,
  fetchOwnerCancellations,
  type CancellationItem,
  fetchOwnerProviderEarningsDetailed,
  type ProviderEarningRow,
  fetchOwnerProviderPayoutsDetailed,
  type ProviderPayoutItem,
  type ProviderPayoutsStatusFilter,
  fetchOwnerAppointmentsOverview,
  type AppointmentsOverviewResponse,
  fetchOwnerServicesReport,
  type ServicesReportResponse,
} from "../_api/owner-reports";

import {
  fetchOwnerFinanceiroWithRange,
  type DailyRevenueItem,
} from "../_api/owner-financeiro";

import {
  fetchOwnerLocationById,
  fetchOwnerLocations,
  type OwnerLocation,
} from "../_api/owner-locations";

import {
  fetchOwnerProfessionals,
  type OwnerProfessional,
} from "../_api/owner-professionals";

import {
  RevenueLineChart,
  type RevenueChartPoint,
} from "../_components/revenue-line-chart";

// ----------------- Helpers -----------------

type TabKey = "overview" | "payouts" | "unidade" | "services";

function safeTab(v: string | null): TabKey {
  if (
    v === "payouts" ||
    v === "unidade" ||
    v === "overview" ||
    v === "services"
  )
    return v;
  return "overview";
}

function getRangeFromPreset(preset: ReportsRangePreset): {
  from: string;
  to: string;
} {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);

  if (preset === "last_30_days") from.setDate(from.getDate() - 30);
  else if (preset === "last_90_days") from.setDate(from.getDate() - 90);
  else from.setFullYear(from.getFullYear() - 1); // last_12_months

  return { from: from.toISOString(), to: to.toISOString() };
}

function formatDateLabelForPreset(
  dateStr: string,
  preset: ReportsRangePreset
): string {
  const d = new Date(dateStr);

  if (preset === "last_12_months") {
    return d.toLocaleDateString("pt-PT", { month: "short", year: "2-digit" });
  }

  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

function formatEUR(value: number): string {
  return `€ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;
}

function formatEURFromCents(cents: number): string {
  return formatEUR((Number(cents ?? 0) || 0) / 100);
}

function formatDateTimePT(dateLike: string | Date | null | undefined): string {
  if (!dateLike) return "—";
  const d = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const weekdayLabels: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

function formatBusinessHours(
  template?: Record<string, [string, string][]> | null
) {
  const t = template ?? null;

  if (!t || Object.keys(t).length === 0) {
    return {
      isDefault: true,
      rows: weekdayLabels.map(({ key, label }) => ({
        label,
        closed: key === "sun",
        intervals:
          key === "sun"
            ? []
            : ([
                ["08:00", "14:00"],
                ["14:00", "20:00"],
              ] as [string, string][]),
      })),
    };
  }

  const rows = weekdayLabels.map(({ key, label }) => {
    const intervals = (t[key] ?? []) as [string, string][];
    const closed = !intervals.length;
    return { label, closed, intervals: intervals.slice(0, 2) };
  });

  return { isDefault: false, rows };
}

function getProfessionalLocationId(prof: OwnerProfessional): string | null {
  const p: any = prof as any;
  return p.locationId ?? p.location?.id ?? p.location_id ?? null;
}

function getProfessionalLocationName(prof: OwnerProfessional): string | null {
  const p: any = prof as any;
  return p.locationName ?? p.location?.name ?? null;
}

// ----------------- Componente principal -----------------

export default function OwnerRelatoriosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabFromUrl = safeTab(searchParams.get("tab"));
  const providerIdFromUrl = searchParams.get("providerId") ?? "";
  const locationIdFromUrl = searchParams.get("locationId") ?? "";

  // ✅ estado local do filtro (reage instantaneamente sem F5)
  const [providerId, setProviderId] = useState(providerIdFromUrl);

  // ✅ sincroniza quando URL muda por push/replace de outros botões
  useEffect(() => {
    setProviderId(providerIdFromUrl);
  }, [providerIdFromUrl]);

  const [tab, setTab] = useState<TabKey>("overview");

  // período
  const [rangePreset, setRangePreset] =
    useState<ReportsRangePreset>("last_30_days");
  const range = useMemo(() => getRangeFromPreset(rangePreset), [rangePreset]);

  // payouts filters
  const [payoutStatus, setPayoutStatus] =
    useState<ProviderPayoutsStatusFilter>("pending");
  // appointments overview
  const [appointmentsOverview, setAppointmentsOverview] =
    useState<AppointmentsOverviewResponse | null>(null);
  const [loadingAppointmentsOverview, setLoadingAppointmentsOverview] =
    useState(false);
  const [errorAppointmentsOverview, setErrorAppointmentsOverview] = useState<
    string | null
  >(null);

  // finanças
  const [monthlyFinancialRows, setMonthlyFinancialRows] = useState<
    MonthlyFinancialRow[]
  >([]);
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenueItem[]>([]);
  const [loadingFinancial, setLoadingFinancial] = useState(true);
  const [errorFinancial, setErrorFinancial] = useState<string | null>(null);

  // providers report
  const [providersReport, setProvidersReport] = useState<ProviderEarningRow[]>(
    []
  );
  const [providersTotals, setProvidersTotals] = useState<{
    totalRevenue: number;
    totalProviderEarnings: number;
    totalHouseEarnings: number;
  } | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [errorProviders, setErrorProviders] = useState<string | null>(null);

  // cancelamentos
  const [cancellationsFilter, setCancellationsFilter] = useState<
    "all" | "cancelled" | "no_show"
  >("all");
  const [cancellations, setCancellations] = useState<CancellationItem[]>([]);
  const [loadingCancellations, setLoadingCancellations] = useState(true);
  const [errorCancellations, setErrorCancellations] = useState<string | null>(
    null
  );

  // payouts detalhado
  const [payoutItems, setPayoutItems] = useState<ProviderPayoutItem[]>([]);
  const [payoutTotals, setPayoutTotals] = useState<{
    count: number;
    servicePriceCents: number;
    providerEarningsCents: number;
    houseEarningsCents: number;
  } | null>(null);
  const [loadingPayouts, setLoadingPayouts] = useState(false);
  const [errorPayouts, setErrorPayouts] = useState<string | null>(null);

  // unidade detail
  const [locationDetail, setLocationDetail] = useState<OwnerLocation | null>(
    null
  );
  const [loadingLocationDetail, setLoadingLocationDetail] = useState(false);
  const [errorLocationDetail, setErrorLocationDetail] = useState<string | null>(
    null
  );

  // profissionais (para filtro)
  const [allProfessionals, setAllProfessionals] = useState<OwnerProfessional[]>(
    []
  );
  const [loadingAllProfessionals, setLoadingAllProfessionals] = useState(false);

  // lista de unidades (select)
  const [locationsList, setLocationsList] = useState<OwnerLocation[]>([]);
  const [loadingLocationsList, setLoadingLocationsList] = useState(false);
  const [errorLocationsList, setErrorLocationsList] = useState<string | null>(
    null
  );

  const serviceIdFromUrl = searchParams.get("serviceId");

  const [servicesReport, setServicesReport] =
    useState<ServicesReportResponse | null>(null);
  const [servicesReportLoading, setServicesReportLoading] = useState(false);
  const [servicesReportError, setServicesReportError] = useState<string | null>(
    null
  );

  // ----------------- URL helpers -----------------
  function setUrlServiceId(nextServiceId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "services");

    if (!nextServiceId) params.delete("serviceId");
    else params.set("serviceId", nextServiceId);

    router.replace(`/owner/relatorios?${params.toString()}`);
    router.refresh();
  }

  function setUrlTab(nextTab: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === "overview") params.delete("tab");
    else params.set("tab", nextTab);
    router.replace(`/owner/relatorios?${params.toString()}`);
  }

  function setUrlLocationId(nextLocationId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "unidade");

    if (!nextLocationId) params.delete("locationId");
    else params.set("locationId", nextLocationId);

    // ✅ opcional e recomendado: ao trocar unidade, limpa profissional (evita mismatch)
    params.delete("providerId");
    setProviderId("");

    router.replace(`/owner/relatorios?${params.toString()}`);
    router.refresh();
  }

  function setUrlProviderId(nextProviderId: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (!nextProviderId) params.delete("providerId");
    else params.set("providerId", nextProviderId);

    router.replace(`/owner/relatorios?${params.toString()}`);
    router.refresh();
  }

  function clearProviderFilter() {
    setProviderId("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("providerId");
    router.replace(`/owner/relatorios?${params.toString()}`);
    router.refresh();
  }

  // ----------------- effects -----------------

  // sync tab com URL
  useEffect(() => {
    setTab(tabFromUrl);
  }, [tabFromUrl]);

  // carrega lista de unidades (select)
  useEffect(() => {
    let cancelled = false;

    async function loadLocationsList() {
      try {
        setLoadingLocationsList(true);
        setErrorLocationsList(null);

        const res = await fetchOwnerLocations({ page: 1, pageSize: 50 });
        if (!cancelled) setLocationsList(res.data ?? []);
      } catch (err) {
        console.error("Erro ao carregar lista de unidades:", err);
        if (!cancelled)
          setErrorLocationsList("Não foi possível carregar unidades.");
      } finally {
        if (!cancelled) setLoadingLocationsList(false);
      }
    }

    loadLocationsList();
    return () => {
      cancelled = true;
    };
  }, []);

  // carrega lista de profissionais (para filtros e unidade)
  useEffect(() => {
    let cancelled = false;

    async function loadAllPros() {
      try {
        setLoadingAllProfessionals(true);
        const list = await fetchOwnerProfessionals();
        if (cancelled) return;
        setAllProfessionals(list ?? []);
      } catch (err) {
        console.error("Erro ao carregar profissionais:", err);
        if (!cancelled) setAllProfessionals([]);
      } finally {
        if (!cancelled) setLoadingAllProfessionals(false);
      }
    }

    loadAllPros();

    return () => {
      cancelled = true;
    };
  }, []);
  // ✅ appointments overview (reage a range + filtros)
  useEffect(() => {
    let cancelled = false;

    async function loadAppointmentsOverview() {
      try {
        setLoadingAppointmentsOverview(true);
        setErrorAppointmentsOverview(null);

        const res = await fetchOwnerAppointmentsOverview({
          from: range.from,
          to: range.to,
          locationId: locationIdFromUrl || undefined,
          providerId: providerId || undefined,
        });

        if (cancelled) return;
        setAppointmentsOverview(res);
      } catch (err) {
        console.error("Erro ao carregar overview de atendimentos:", err);
        if (!cancelled)
          setErrorAppointmentsOverview(
            "Erro ao carregar overview de atendimentos."
          );
      } finally {
        if (!cancelled) setLoadingAppointmentsOverview(false);
      }
    }

    loadAppointmentsOverview();

    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, locationIdFromUrl, providerId]);

  // ✅ finanças (agora reage ao providerId)
  useEffect(() => {
    let cancelled = false;

    async function loadFinancial() {
      try {
        setLoadingFinancial(true);
        setErrorFinancial(null);

        const [monthlyRows, financeiroData] = await Promise.all([
          fetchOwnerMonthlyFinancial(rangePreset, {
            locationId: locationIdFromUrl || undefined,
            providerId: providerId || undefined,
          }),
          fetchOwnerFinanceiroWithRange({
            from: range.from,
            to: range.to,
            locationId: locationIdFromUrl || undefined,
            providerId: providerId || undefined,
          }),
        ]);

        if (cancelled) return;

        setMonthlyFinancialRows(monthlyRows);
        setDailyRevenue(financeiroData.dailyRevenue);
      } catch (err) {
        console.error("Erro ao carregar relatório financeiro:", err);
        if (!cancelled)
          setErrorFinancial("Erro ao carregar dados financeiros.");
      } finally {
        if (!cancelled) setLoadingFinancial(false);
      }
    }

    loadFinancial();
    return () => {
      cancelled = true;
    };
  }, [rangePreset, range.from, range.to, locationIdFromUrl, providerId]);

  // ✅ providers report (agora reage ao providerId)
  useEffect(() => {
    let cancelled = false;

    async function loadProviders() {
      try {
        setLoadingProviders(true);
        setErrorProviders(null);

        const result = await fetchOwnerProviderEarningsDetailed(rangePreset, {
          locationId: locationIdFromUrl || undefined,
          providerId: providerId || undefined,
        });

        if (cancelled) return;

        setProvidersReport(result.items);
        setProvidersTotals(result.totals);
      } catch (err) {
        console.error("Erro ao carregar relatório por profissional:", err);
        if (!cancelled)
          setErrorProviders("Erro ao carregar dados de profissionais.");
      } finally {
        if (!cancelled) setLoadingProviders(false);
      }
    }

    loadProviders();
    return () => {
      cancelled = true;
    };
  }, [rangePreset, locationIdFromUrl, providerId]);

  // ✅ cancelamentos/no-shows (já estava ok, mantido)
  useEffect(() => {
    let cancelled = false;

    async function loadCancellations() {
      try {
        setLoadingCancellations(true);
        setErrorCancellations(null);

        const items = await fetchOwnerCancellations(
          rangePreset,
          cancellationsFilter,
          {
            locationId: locationIdFromUrl || undefined,
            providerId: providerId || undefined,
          }
        );

        if (cancelled) return;

        setCancellations(items);
      } catch (err) {
        console.error("Erro ao carregar cancelamentos/no-shows:", err);
        if (!cancelled)
          setErrorCancellations("Erro ao carregar cancelamentos.");
      } finally {
        if (!cancelled) setLoadingCancellations(false);
      }
    }

    loadCancellations();
    return () => {
      cancelled = true;
    };
  }, [rangePreset, cancellationsFilter, locationIdFromUrl, providerId]);

  // payouts detalhado quando tab=payouts
  useEffect(() => {
    let cancelled = false;

    async function loadPayouts() {
      if (tab !== "payouts") return;

      try {
        setLoadingPayouts(true);
        setErrorPayouts(null);

        const res = await fetchOwnerProviderPayoutsDetailed({
          from: range.from,
          to: range.to,
          status: payoutStatus,
          locationId: locationIdFromUrl || undefined,
          providerId: providerId || undefined,
        });

        if (cancelled) return;

        setPayoutItems(res.items);
        setPayoutTotals(res.totals);
      } catch (err) {
        console.error("Erro ao carregar repasses (payouts):", err);
        if (!cancelled) {
          setErrorPayouts("Erro ao carregar repasses dos profissionais.");
          setPayoutItems([]);
          setPayoutTotals(null);
        }
      } finally {
        if (!cancelled) setLoadingPayouts(false);
      }
    }

    loadPayouts();
    return () => {
      cancelled = true;
    };
  }, [tab, range.from, range.to, payoutStatus, locationIdFromUrl, providerId]);

  // unidade: detalhes
  useEffect(() => {
    let cancelled = false;

    async function loadUnit() {
      if (tab !== "unidade") return;

      if (!locationIdFromUrl) {
        setLocationDetail(null);
        setErrorLocationDetail(null);
        return;
      }

      try {
        setLoadingLocationDetail(true);
        setErrorLocationDetail(null);

        const loc = await fetchOwnerLocationById(locationIdFromUrl);
        if (cancelled) return;

        setLocationDetail(loc);
      } catch (err) {
        console.error("Erro ao carregar dados da unidade:", err);
        if (!cancelled) {
          setErrorLocationDetail(
            "Não foi possível carregar os dados da unidade."
          );
          setLocationDetail(null);
        }
      } finally {
        if (!cancelled) setLoadingLocationDetail(false);
      }
    }

    loadUnit();

    return () => {
      cancelled = true;
    };
  }, [tab, locationIdFromUrl]);
  useEffect(() => {
    if (tab !== "services") return;

    let cancelled = false;

    (async () => {
      setServicesReportLoading(true);
      setServicesReportError(null);

      try {
        const data = await fetchOwnerServicesReport({
          from: range.from,
          to: range.to,
          locationId: locationIdFromUrl || undefined,
          providerId: providerId || undefined,
          serviceId: serviceIdFromUrl || undefined,
        });

        if (!cancelled) setServicesReport(data);
      } catch (err) {
        console.error("Erro ao carregar relatório de serviços:", err);
        if (!cancelled)
          setServicesReportError("Erro ao carregar relatório de serviços.");
      } finally {
        if (!cancelled) setServicesReportLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    tab,
    range.from,
    range.to,
    locationIdFromUrl,
    providerId,
    serviceIdFromUrl,
  ]);

  // ----------------- memos -----------------

  const professionalsForHeader = useMemo(() => {
    if (!locationIdFromUrl) return allProfessionals;
    return allProfessionals.filter(
      (p) => getProfessionalLocationId(p) === locationIdFromUrl
    );
  }, [allProfessionals, locationIdFromUrl]);

  const revenueChartData: RevenueChartPoint[] = useMemo(
    () =>
      dailyRevenue.map((item) => ({
        label: formatDateLabelForPreset(item.date, rangePreset),
        value: item.totalRevenue,
      })),
    [dailyRevenue, rangePreset]
  );

  const revenueKpis = useMemo(() => {
    if (!dailyRevenue.length)
      return { totalRevenue: 0, averagePerDay: 0, activeDays: 0 };

    const totalRevenue = dailyRevenue.reduce(
      (acc, item) => acc + item.totalRevenue,
      0
    );
    const activeDays = dailyRevenue.length;
    const averagePerDay = totalRevenue / activeDays;

    return { totalRevenue, averagePerDay, activeDays };
  }, [dailyRevenue]);

  const professionalsLinkedToLocation = useMemo(() => {
    if (!locationDetail) return [];
    const locId = (locationDetail as any).id;
    const locName = (locationDetail as any).name;

    const byId = allProfessionals.filter(
      (p) => getProfessionalLocationId(p) === locId
    );
    if (byId.length) return byId;

    return allProfessionals.filter(
      (p) => getProfessionalLocationName(p) === locName
    );
  }, [allProfessionals, locationDetail]);

  const hours = useMemo(
    () =>
      formatBusinessHours(
        (locationDetail as any)?.businessHoursTemplate ?? null
      ),
    [locationDetail]
  );

  const unitIndicators = useMemo(() => {
    const cancels = cancellations.length;
    const providersWithMovement = providersReport.length;
    const apptsCount = providersReport.reduce(
      (acc, p) => acc + (p.appointmentsCount ?? 0),
      0
    );

    return {
      cancellations: cancels,
      providersWithMovement,
      appointments: apptsCount,
    };
  }, [cancellations.length, providersReport]);

  const locationManagerName = useMemo(() => {
    const l: any = locationDetail as any;
    return l?.managerProviderName ?? l?.manager?.name ?? l?.managerName ?? "—";
  }, [locationDetail]);

  const locationActive = useMemo(() => {
    const l: any = locationDetail as any;
    return typeof l?.active === "boolean"
      ? l.active
      : typeof l?.isActive === "boolean"
      ? l.isActive
      : true;
  }, [locationDetail]);
  const selectedService = useMemo(() => {
    if (!servicesReport || !serviceIdFromUrl) return null;
    return (
      servicesReport.services.find((s) => s.serviceId === serviceIdFromUrl) ??
      null
    );
  }, [servicesReport, serviceIdFromUrl]);

  const servicesByDayChartData: RevenueChartPoint[] = useMemo(() => {
    if (!servicesReport) return [];

    return (servicesReport.series?.byDay ?? []).map((d) => ({
      label: new Date(d.day).toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
      }),
      value: (Number(d.revenueCents ?? 0) || 0) / 100,
    }));
  }, [servicesReport]);

  // ----------------- render -----------------

  return (
    <>
      {/* Cabeçalho */}
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Relatórios</h1>
          <p className="text-xs text-slate-400">
            Análises detalhadas de faturamento, ocupação, cancelamentos e
            repasses.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <select
            className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200"
            value={rangePreset}
            onChange={(e) =>
              setRangePreset(e.target.value as ReportsRangePreset)
            }
          >
            <option value="last_30_days">Últimos 30 dias</option>
            <option value="last_90_days">Últimos 90 dias</option>
            <option value="last_12_months">Últimos 12 meses</option>
          </select>

          <select
            value={locationIdFromUrl}
            onChange={(e) => setUrlLocationId(e.target.value)}
            className="w-full md:w-[180px] rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
            disabled={loadingLocationsList}
          >
            <option value="">Selecione a unidade</option>
            {locationsList.map((loc) => (
              <option key={(loc as any).id} value={(loc as any).id}>
                {(loc as any).name}
                {(loc as any).address ? ` · ${(loc as any).address}` : ""}
              </option>
            ))}
          </select>

          <select
            value={providerId}
            onChange={(e) => {
              const v = e.target.value;
              setProviderId(v);
              setUrlProviderId(v);
            }}
            className="w-full md:w-[180px] rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
            disabled={loadingAllProfessionals}
          >
            <option value="">
              {locationIdFromUrl
                ? "Profissional (da unidade)"
                : "Profissional (todos)"}
            </option>

            {professionalsForHeader.map((p) => (
              <option key={(p as any).id} value={(p as any).id}>
                {(p as any).name}
              </option>
            ))}
          </select>

          <button className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80">
            Exportar CSV
          </button>
        </div>
      </header>

      {/* Abas */}
      <div className="mb-4 flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setUrlTab("overview")}
          className={[
            "px-3 py-1 rounded-lg border",
            tab === "overview"
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
              : "border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-700",
          ].join(" ")}
        >
          Geral
        </button>

        <button
          type="button"
          onClick={() => setUrlTab("payouts")}
          className={[
            "px-3 py-1 rounded-lg border",
            tab === "payouts"
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
              : "border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-700",
          ].join(" ")}
        >
          Repasse profissionais
        </button>

        <button
          type="button"
          onClick={() => setUrlTab("unidade")}
          className={[
            "px-3 py-1 rounded-lg border",
            tab === "unidade"
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
              : "border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-700",
          ].join(" ")}
        >
          Unidade
        </button>
        <button
          type="button"
          onClick={() => setUrlTab("services")}
          className={[
            "px-3 py-1 rounded-lg border",
            tab === "services"
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
              : "border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-700",
          ].join(" ")}
        >
          Serviços
        </button>

        {providerId ? (
          <div className="ml-2 flex items-center gap-2">
            <span className="text-[11px] text-slate-400">
              Filtrado por profissional
            </span>
            <button
              type="button"
              className="text-[11px] text-emerald-400 hover:underline"
              onClick={clearProviderFilter}
            >
              Limpar filtro
            </button>
          </div>
        ) : null}
      </div>

      {/* ===================== */}
      {/* TAB: UNIDADE */}
      {/* ===================== */}
      {tab === "unidade" ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-100">
                  Relatório da unidade
                </p>
                <p className="text-[11px] text-slate-400">
                  Detalhes, horários, profissionais e faturamento filtrados por
                  unidade.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {locationIdFromUrl ? (
                  <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-[11px] text-slate-200">
                    ID: {locationIdFromUrl}
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={() => router.push("/owner/unidades")}
                  className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-500/60 hover:text-emerald-200"
                >
                  Ir para Unidades
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-1">
              <label className="text-[11px] text-slate-400">
                Obtenha informações e relatorios sobre a unidade que desejar
                selecionando acima
              </label>

              {loadingLocationsList ? (
                <span className="text-[11px] text-slate-500">
                  Carregando unidades...
                </span>
              ) : null}

              {errorLocationsList ? (
                <span className="text-[11px] text-rose-400">
                  {errorLocationsList}
                </span>
              ) : null}

              {!locationIdFromUrl ? (
                <span className="mt-2 text-[12px] text-slate-300">
                  Selecione uma unidade acima para ver os dados.
                </span>
              ) : null}
            </div>
          </div>

          {!locationIdFromUrl ? null : (
            <>
              {errorLocationDetail ? (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-200">
                  {errorLocationDetail}
                </div>
              ) : null}

              {loadingLocationDetail ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
                  Carregando dados da unidade...
                </div>
              ) : null}

              {!loadingLocationDetail && locationDetail ? (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-[11px] text-slate-400">Unidade</p>
                      <p className="mt-1 text-base font-semibold text-slate-100">
                        {(locationDetail as any).name}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-300">
                        {(locationDetail as any).address ?? "—"}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                        {locationActive ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 px-2 py-0.5">
                            Ativa
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-800 text-slate-200 border border-slate-700 px-2 py-0.5">
                            Inativa
                          </span>
                        )}

                        <span className="inline-flex items-center rounded-full bg-slate-950/60 text-slate-200 border border-slate-700 px-2 py-0.5">
                          Responsável: {locationManagerName}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[11px] text-slate-400">
                            Horários de funcionamento
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {hours.isDefault
                              ? "Padrão do sistema"
                              : "Personalizado"}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => router.push("/owner/unidades")}
                          className="text-[11px] text-emerald-300 hover:underline"
                        >
                          Editar em Unidades
                        </button>
                      </div>

                      <div className="mt-3 space-y-2 text-[11px]">
                        {hours.rows.map((r) => (
                          <div
                            key={r.label}
                            className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 flex items-center justify-between"
                          >
                            <span className="text-slate-200">{r.label}</span>
                            {r.closed ? (
                              <span className="text-slate-500">Fechado</span>
                            ) : (
                              <span className="text-slate-300">
                                {r.intervals
                                  .map(([a, b]) => `${a}–${b}`)
                                  .join(" · ")}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-[11px] text-slate-400">
                        Indicadores no período
                      </p>

                      <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                          <p className="text-slate-400">Faturamento</p>
                          <p className="mt-1 text-sm font-semibold text-slate-100">
                            {formatEUR(revenueKpis.totalRevenue)}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-500">
                            Média/dia: {formatEUR(revenueKpis.averagePerDay)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                          <p className="text-slate-400">Movimento</p>
                          <p className="mt-1 text-sm font-semibold text-slate-100">
                            {revenueKpis.activeDays} dias
                          </p>
                          <p className="mt-1 text-[10px] text-slate-500">
                            Atendimentos: {unitIndicators.appointments}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                          <p className="text-slate-400">Profissionais</p>
                          <p className="mt-1 text-sm font-semibold text-slate-100">
                            {professionalsLinkedToLocation.length}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-500">
                            Com movimento:{" "}
                            {unitIndicators.providersWithMovement}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                          <p className="text-slate-400">Cancelamentos</p>
                          <p className="mt-1 text-sm font-semibold text-slate-100">
                            {unitIndicators.cancellations}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-500">
                            Filtro: {cancellationsFilter}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-slate-400">
                          Faturamento diário (unidade)
                        </p>
                        <span className="text-[10px] text-slate-500">
                          Período selecionado
                        </span>
                      </div>

                      {loadingFinancial ? (
                        <p className="text-[11px] text-slate-400">
                          Carregando...
                        </p>
                      ) : errorFinancial ? (
                        <p className="text-[11px] text-rose-400">
                          {errorFinancial}
                        </p>
                      ) : (
                        <RevenueLineChart data={revenueChartData} />
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-slate-400">
                          Profissionais vinculados
                        </p>
                        {loadingAllProfessionals ? (
                          <span className="text-[10px] text-slate-500">
                            Carregando...
                          </span>
                        ) : null}
                      </div>

                      {!loadingAllProfessionals &&
                      professionalsLinkedToLocation.length === 0 ? (
                        <p className="text-[11px] text-slate-500">
                          Nenhum profissional vinculado a essa unidade.
                        </p>
                      ) : null}

                      {!loadingAllProfessionals &&
                      professionalsLinkedToLocation.length > 0 ? (
                        <div className="space-y-2">
                          {professionalsLinkedToLocation.map((p) => (
                            <div
                              key={(p as any).id ?? (p as any).providerId}
                              className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="text-[11px] font-medium text-slate-100 truncate">
                                  {(p as any).name ?? "—"}
                                </p>
                                <p className="text-[10px] text-slate-500 truncate">
                                  {getProfessionalLocationName(p) ??
                                    (locationDetail as any).name}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  const params = new URLSearchParams(
                                    searchParams.toString()
                                  );
                                  params.set("tab", "payouts");
                                  const pid =
                                    (p as any).id ?? (p as any).providerId;
                                  if (pid)
                                    params.set("providerId", String(pid));
                                  router.push(
                                    `/owner/relatorios?${params.toString()}`
                                  );
                                }}
                                className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
                              >
                                Ver repasses
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-slate-400">
                        Performance por profissional (unidade)
                      </p>
                      <span className="text-[10px] text-slate-500">
                        Atendimentos concluídos
                      </span>
                    </div>

                    {loadingProviders ? (
                      <p className="text-[11px] text-slate-400">
                        Carregando...
                      </p>
                    ) : errorProviders ? (
                      <p className="text-[11px] text-rose-400">
                        {errorProviders}
                      </p>
                    ) : providersReport.length === 0 ? (
                      <p className="text-[11px] text-slate-500">
                        Sem movimento no período.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {providersReport.map((row) => (
                          <div
                            key={row.providerId}
                            className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium text-slate-100 truncate">
                                {row.providerName}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate">
                                {row.appointmentsCount} atendimentos · Ticket
                                médio: {formatEUR(row.averageTicket)}
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="text-[10px] text-slate-500">
                                Faturamento
                              </p>
                              <p className="text-sm font-semibold text-slate-100">
                                {formatEUR(row.totalRevenue)}
                              </p>
                            </div>
                          </div>
                        ))}

                        {providersTotals ? (
                          <p className="mt-2 text-[10px] text-slate-500">
                            Totais — Faturamento:{" "}
                            {formatEUR(providersTotals.totalRevenue)} ·
                            Profissionais:{" "}
                            {formatEUR(providersTotals.totalProviderEarnings)} ·
                            Espaço:{" "}
                            {formatEUR(providersTotals.totalHouseEarnings)}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {/* ===================== */}
      {/* TAB: OVERVIEW */}
      {/* ===================== */}
      {tab === "overview" ? (
        <>
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-400">Atendimentos no período</p>
              <span className="text-[10px] text-slate-500">
                Overview (concluídos / cancelados / no-show)
              </span>
            </div>

            {loadingAppointmentsOverview ? (
              <p className="text-[11px] text-slate-400">Carregando...</p>
            ) : errorAppointmentsOverview ? (
              <p className="text-[11px] text-rose-400">
                {errorAppointmentsOverview}
              </p>
            ) : !appointmentsOverview ? (
              <p className="text-[11px] text-slate-500">Sem dados.</p>
            ) : (
              <div className="text-[11px] text-slate-200">
                {/* backend pode mandar days ou items — aqui só exibimos o que vier */}
                {Array.isArray((appointmentsOverview as any).items) &&
                (appointmentsOverview as any).items.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(appointmentsOverview as any).items
                      .slice(0, 8)
                      .map((it: any, idx: number) => (
                        <div
                          key={`${it?.label ?? "item"}-${idx}`}
                          className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                        >
                          <p className="text-slate-400 truncate">
                            {String(it?.label ?? "—")}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-100">
                            {Number(it?.value ?? 0)}
                          </p>
                        </div>
                      ))}
                  </div>
                ) : Array.isArray((appointmentsOverview as any).days) &&
                  (appointmentsOverview as any).days.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(() => {
                      const days = (appointmentsOverview as any).days as any[];
                      const sum = (keys: string[]) =>
                        days.reduce((acc, d) => {
                          for (const k of keys) {
                            if (typeof d?.[k] === "number") return acc + d[k];
                          }
                          return acc;
                        }, 0);

                      const total =
                        sum(["total", "count", "totalCount"]) ||
                        days.reduce((acc, d) => {
                          const vals = Object.values(d ?? {}).filter(
                            (v) => typeof v === "number"
                          ) as number[];
                          return acc + (vals[0] ?? 0);
                        }, 0);

                      const completed = sum([
                        "completed",
                        "done",
                        "completedCount",
                      ]);
                      const cancelled = sum([
                        "cancelled",
                        "canceled",
                        "cancelledCount",
                        "canceledCount",
                      ]);
                      const noShow = sum(["noShow", "no_show", "noShowCount"]);

                      const kpis = [
                        { label: "Total", value: total },
                        { label: "Concluídos", value: completed },
                        { label: "Cancelados", value: cancelled },
                        { label: "No-show", value: noShow },
                      ];

                      return kpis.map((k) => (
                        <div
                          key={k.label}
                          className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                        >
                          <p className="text-slate-400">{k.label}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-100">
                            {k.value}
                          </p>
                        </div>
                      ));
                    })()}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Resposta vazia (sem days/items).
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400">Ocupação por profissional</p>
              </div>

              {loadingProviders ? (
                <p className="text-[11px] text-slate-400">
                  Carregando dados dos profissionais...
                </p>
              ) : errorProviders ? (
                <p className="text-[11px] text-rose-400">{errorProviders}</p>
              ) : (
                <>
                  {providersReport.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      Nenhum atendimento concluído no período selecionado.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {providersReport.map((row) => (
                        <div
                          key={row.providerId}
                          className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 flex items-center justify-between gap-3"
                        >
                          <div className="flex-1">
                            <p className="text-[11px] font-medium">
                              {row.providerName}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {row.locationName ?? "Sem unidade vinculada"} ·{" "}
                              {row.appointmentsCount} atendimentos
                            </p>
                            <p className="mt-1 text-[10px] text-slate-400">
                              Ticket médio: {formatEUR(row.averageTicket)}
                            </p>

                            <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-500/70"
                                style={{
                                  width: `${row.occupationPercentage}%`,
                                }}
                              />
                            </div>
                          </div>

                          <div className="w-24 text-right">
                            <p className="text-[10px] text-slate-400">
                              Ocupação
                            </p>
                            <p className="text-sm font-semibold">
                              {row.occupationPercentage}%
                            </p>
                            <p className="mt-1 text-[10px] text-slate-400">
                              Profissional: {formatEUR(row.providerEarnings)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {providersTotals && providersReport.length > 0 ? (
                    <p className="mt-2 text-[10px] text-slate-500">
                      Total no período — Faturamento:{" "}
                      {formatEUR(providersTotals.totalRevenue)} · Profissionais:{" "}
                      {formatEUR(providersTotals.totalProviderEarnings)} ·
                      Espaço: {formatEUR(providersTotals.totalHouseEarnings)}
                    </p>
                  ) : null}
                </>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400">Faturamento no período</p>
                <span className="text-[11px] text-slate-500">
                  Serviços concluídos (avulsos + planos)
                </span>
              </div>

              {loadingFinancial ? (
                <p className="text-[11px] text-slate-400">
                  Carregando dados financeiros...
                </p>
              ) : errorFinancial ? (
                <p className="text-[11px] text-rose-400">{errorFinancial}</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-3 text-[11px]">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2">
                      <p className="text-slate-400">Faturamento total</p>
                      <p className="mt-1 text-sm font-semibold">
                        {formatEUR(revenueKpis.totalRevenue)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2">
                      <p className="text-slate-400">Média por dia</p>
                      <p className="mt-1 text-sm font-semibold">
                        {formatEUR(revenueKpis.averagePerDay)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2">
                      <p className="text-slate-400">Dias com movimento</p>
                      <p className="mt-1 text-sm font-semibold">
                        {revenueKpis.activeDays}
                      </p>
                    </div>
                  </div>

                  <RevenueLineChart data={revenueChartData} />
                </>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-400">Resumo mensal</p>
              <span className="text-[10px] text-slate-500">
                Baseado no preset selecionado
              </span>
            </div>

            {loadingFinancial ? (
              <p className="text-[11px] text-slate-400">Carregando...</p>
            ) : !errorFinancial && monthlyFinancialRows.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                Sem dados no período.
              </p>
            ) : !errorFinancial && monthlyFinancialRows.length > 0 ? (
              <div className="overflow-auto">
                <table className="w-full border-collapse text-[11px] min-w-[560px]">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="text-left py-2 pr-3 border-b border-slate-800">
                        Mês
                      </th>
                      <th className="text-right py-2 px-3 border-b border-slate-800">
                        Receita
                      </th>
                      <th className="text-right py-2 px-3 border-b border-slate-800">
                        Profissionais
                      </th>
                      <th className="text-right py-2 pl-3 border-b border-slate-800">
                        Espaço
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyFinancialRows.map((row) => (
                      <tr
                        key={row.monthLabel}
                        className="hover:bg-slate-950/50"
                      >
                        <td className="py-2 pr-3 text-slate-200">
                          {row.monthLabel}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          {formatEUR(row.totalRevenue)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          {formatEUR(row.professionalsShare)}
                        </td>
                        <td className="py-2 pl-3 text-right text-slate-200">
                          {formatEUR(row.spaceShare)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[11px] text-rose-400">{errorFinancial}</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-3">
              <div>
                <p className="text-slate-400">Cancelamentos e faltas</p>
                <p className="text-[10px] text-slate-500">
                  Itens no período selecionado.
                </p>
              </div>

              <select
                className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200"
                value={cancellationsFilter}
                onChange={(e) => setCancellationsFilter(e.target.value as any)}
              >
                <option value="all">Todos</option>
                <option value="cancelled">Cancelados</option>
                <option value="no_show">No-show</option>
              </select>
            </div>

            {loadingCancellations ? (
              <p className="text-[11px] text-slate-400">Carregando...</p>
            ) : errorCancellations ? (
              <p className="text-[11px] text-rose-400">{errorCancellations}</p>
            ) : cancellations.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                Nenhum cancelamento/no-show no período.
              </p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full border-collapse text-[11px] min-w-[720px]">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="text-left py-2 pr-3 border-b border-slate-800">
                        Data
                      </th>
                      <th className="text-left py-2 pr-3 border-b border-slate-800">
                        Cliente
                      </th>
                      <th className="text-left py-2 pr-3 border-b border-slate-800">
                        Serviço
                      </th>
                      <th className="text-left py-2 pr-3 border-b border-slate-800">
                        Profissional
                      </th>
                      <th className="text-left py-2 pl-3 border-b border-slate-800">
                        Tipo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancellations.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-950/50">
                        <td className="py-2 pr-3 text-slate-200">
                          {formatDateTimePT(c.date)}
                        </td>
                        <td className="py-2 pr-3 text-slate-200">
                          {c.customerName ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-slate-200">
                          {c.serviceName ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-slate-200">
                          {c.professionalName ?? "—"}
                        </td>
                        <td className="py-2 pl-3">
                          <CancellationTypeBadge status={c.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {/* ===================== */}
      {/* TAB: PAYOUTS */}
      {/* ===================== */}
      {tab === "payouts" ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-3">
            <div>
              <p className="text-slate-400">Repasse a profissionais</p>
              <p className="text-[10px] text-slate-500">
                Lista de atendimentos concluídos no período (com unidade e
                valores).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200"
                value={payoutStatus}
                onChange={(e) =>
                  setPayoutStatus(e.target.value as ProviderPayoutsStatusFilter)
                }
                title="Status do repasse"
              >
                <option value="pending">Pendentes</option>
                <option value="paid">Pagos</option>
                <option value="all">Todos</option>
              </select>

              {providerId ? (
                <button
                  type="button"
                  className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-emerald-200 hover:border-emerald-500/60"
                  onClick={clearProviderFilter}
                >
                  Limpar profissional
                </button>
              ) : null}
            </div>
          </div>

          {loadingPayouts ? (
            <p className="text-[11px] text-slate-400">Carregando repasses...</p>
          ) : errorPayouts ? (
            <p className="text-[11px] text-rose-400">{errorPayouts}</p>
          ) : payoutItems.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Nenhum repasse encontrado no período/filtros.
            </p>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="w-full border-collapse text-[11px] min-w-[980px]">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="text-left py-2 pr-3 border-b border-slate-800">
                        Data
                      </th>
                      <th className="text-left py-2 pr-3 border-b border-slate-800">
                        Profissional
                      </th>
                      <th className="text-left py-2 pr-3 border-b border-slate-800">
                        Cliente
                      </th>
                      <th className="text-left py-2 pr-3 border-b border-slate-800">
                        Serviço
                      </th>
                      <th className="text-left py-2 pr-3 border-b border-slate-800">
                        Unidade
                      </th>
                      <th className="text-right py-2 px-3 border-b border-slate-800">
                        Preço
                      </th>
                      <th className="text-right py-2 px-3 border-b border-slate-800">
                        Comissão %
                      </th>
                      <th className="text-right py-2 px-3 border-b border-slate-800">
                        Profissional
                      </th>
                      <th className="text-right py-2 px-3 border-b border-slate-800">
                        Espaço
                      </th>
                      <th className="text-left py-2 pl-3 border-b border-slate-800">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payoutItems.map((it) => (
                      <tr key={it.earningId} className="hover:bg-slate-950/50">
                        <td className="py-2 pr-3 text-slate-200">
                          {formatDateTimePT(it.date)}
                        </td>
                        <td className="py-2 pr-3 text-slate-200">
                          {it.provider?.name ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-slate-200">
                          {it.customerName ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-slate-200">
                          {it.serviceName ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-slate-200">
                          {it.location?.name ?? "—"}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          {formatEURFromCents(it.servicePriceCents)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          {typeof it.commissionPercentage === "number"
                            ? `${it.commissionPercentage}%`
                            : "—"}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          {formatEURFromCents(it.providerEarningsCents)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          {formatEURFromCents(it.houseEarningsCents)}
                        </td>
                        <td className="py-2 pl-3">
                          <PayoutStatusBadge status={it.payoutStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {payoutTotals ? (
                <p className="mt-2 text-[10px] text-slate-500">
                  Totais — Itens: {payoutTotals.count} · Serviço:{" "}
                  {formatEURFromCents(payoutTotals.servicePriceCents)} ·
                  Profissionais:{" "}
                  {formatEURFromCents(payoutTotals.providerEarningsCents)} ·
                  Espaço: {formatEURFromCents(payoutTotals.houseEarningsCents)}
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}
      {tab === "services" ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-slate-200 font-medium">
                Relatório de Serviços
              </p>
              <p className="text-[15px] text-emerald-500">
                Selecione algum serviço abaixo para relatorio detalhado.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setUrlTab("overview")}
              className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-500/60 hover:text-emerald-200"
            >
              Voltar ao Geral
            </button>
          </div>

          {servicesReportLoading ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-[11px] text-slate-400">
              Carregando relatório de serviços...
            </div>
          ) : servicesReportError ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-[11px] text-rose-200">
              {servicesReportError}
            </div>
          ) : !servicesReport ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-[11px] text-slate-400">
              Sem dados para os filtros selecionados.
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] text-slate-400">Atendimentos</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">
                    {servicesReport.kpis.appointmentsDone}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] text-slate-400">Faturamento</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">
                    {formatEURFromCents(servicesReport.kpis.revenueCents)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] text-slate-400">Ticket médio</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">
                    {formatEURFromCents(servicesReport.kpis.avgTicketCents)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] text-slate-400">Clientes únicos</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">
                    {servicesReport.kpis.uniqueCustomers}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] text-slate-400">Profissionais</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">
                    {formatEURFromCents(
                      servicesReport.kpis.providerEarningsCents
                    )}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] text-slate-400">Espaço</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">
                    {formatEURFromCents(servicesReport.kpis.houseEarningsCents)}
                  </p>
                </div>
              </div>

              {/* Ranking */}
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] text-slate-300 font-medium">
                    Ranking de serviços
                  </p>

                  {serviceIdFromUrl ? (
                    <button
                      type="button"
                      onClick={() => setUrlServiceId("")}
                      className="text-[11px] text-emerald-300 hover:underline"
                    >
                      Limpar serviço selecionado
                    </button>
                  ) : null}
                </div>

                {servicesReport.services.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    Sem serviços no período.
                  </p>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full border-collapse text-[11px] min-w-[760px]">
                      <thead>
                        <tr className="text-slate-400">
                          <th className="text-left py-2 pr-3 border-b border-slate-800">
                            Serviço
                          </th>
                          <th className="text-left py-2 pr-3 border-b border-slate-800">
                            Categoria
                          </th>
                          <th className="text-right py-2 px-3 border-b border-slate-800">
                            Atend.
                          </th>
                          <th className="text-right py-2 px-3 border-b border-slate-800">
                            Receita
                          </th>
                          <th className="text-right py-2 px-3 border-b border-slate-800">
                            Ticket
                          </th>
                          <th className="text-right py-2 pl-3 border-b border-slate-800">
                            % Receita
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {[...servicesReport.services]
                          .sort((a, b) => b.revenueCents - a.revenueCents)
                          .map((s) => {
                            const isSelected = serviceIdFromUrl === s.serviceId;

                            return (
                              <tr
                                key={s.serviceId}
                                onClick={() => setUrlServiceId(s.serviceId)}
                                className={[
                                  "cursor-pointer hover:bg-slate-900/40",
                                  isSelected ? "bg-emerald-500/10" : "",
                                ].join(" ")}
                                title="Clique para filtrar este serviço"
                              >
                                <td className="py-2 pr-3 text-slate-200">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">
                                      {s.name}
                                    </span>
                                    {isSelected ? (
                                      <span className="text-[10px] px-2 py-[1px] rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                                        Selecionado
                                      </span>
                                    ) : null}
                                  </div>
                                </td>

                                <td className="py-2 pr-3 text-slate-300">
                                  {s.category ?? "—"}
                                </td>

                                <td className="py-2 px-3 text-right text-slate-200">
                                  {s.appointmentsDone}
                                </td>

                                <td className="py-2 px-3 text-right text-slate-200">
                                  {formatEURFromCents(s.revenueCents)}
                                </td>

                                <td className="py-2 px-3 text-right text-slate-200">
                                  {formatEURFromCents(s.avgTicketCents)}
                                </td>

                                <td className="py-2 pl-3 text-right text-slate-200">
                                  {`${Math.round(
                                    (s.shareRevenue ?? 0) * 100
                                  )}%`}
                                </td>
                              </tr>
                            );
                          })}

                        {serviceIdFromUrl ? (
                          <tr>
                            <td colSpan={6} className="pt-4">
                              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-[11px] text-slate-400">
                                        Serviço selecionado
                                      </p>
                                      <p className="mt-1 text-base font-semibold text-slate-100">
                                        {selectedService?.name ?? "—"}
                                      </p>
                                      <p className="mt-1 text-[11px] text-slate-300">
                                        Categoria:{" "}
                                        {selectedService?.category ?? "—"}
                                      </p>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => setUrlServiceId("")}
                                      className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-500/60 hover:text-emerald-200"
                                    >
                                      Voltar
                                    </button>
                                  </div>

                                  <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                      <p className="text-slate-400">
                                        Atendimentos
                                      </p>
                                      <p className="mt-1 text-sm font-semibold text-slate-100">
                                        {selectedService?.appointmentsDone ?? 0}
                                      </p>
                                    </div>

                                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                      <p className="text-slate-400">Receita</p>
                                      <p className="mt-1 text-sm font-semibold text-slate-100">
                                        {formatEURFromCents(
                                          selectedService?.revenueCents ?? 0
                                        )}
                                      </p>
                                    </div>

                                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                      <p className="text-slate-400">
                                        Ticket médio
                                      </p>
                                      <p className="mt-1 text-sm font-semibold text-slate-100">
                                        {formatEURFromCents(
                                          selectedService?.avgTicketCents ?? 0
                                        )}
                                      </p>
                                    </div>

                                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                      <p className="text-slate-400">
                                        % Receita
                                      </p>
                                      <p className="mt-1 text-sm font-semibold text-slate-100">
                                        {`${Math.round(
                                          (selectedService?.shareRevenue ?? 0) *
                                            100
                                        )}%`}
                                      </p>
                                    </div>

                                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                      <p className="text-slate-400">
                                        Profissionais
                                      </p>
                                      <p className="mt-1 text-sm font-semibold text-slate-100">
                                        {formatEURFromCents(
                                          selectedService?.providerEarningsCents ??
                                            0
                                        )}
                                      </p>
                                    </div>

                                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                      <p className="text-slate-400">Espaço</p>
                                      <p className="mt-1 text-sm font-semibold text-slate-100">
                                        {formatEURFromCents(
                                          selectedService?.houseEarningsCents ??
                                            0
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
                                  <div className="flex items-center justify-between mb-3">
                                    <p className="text-slate-400">
                                      Receita por dia (serviço)
                                    </p>
                                    <span className="text-[10px] text-slate-500">
                                      Período selecionado
                                    </span>
                                  </div>

                                  {servicesByDayChartData.length === 0 ? (
                                    <p className="text-[11px] text-slate-500">
                                      Sem dados no período.
                                    </p>
                                  ) : (
                                    <div className="h-[260px]">
                                      <RevenueLineChart
                                        data={servicesByDayChartData}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}

function CancellationTypeBadge({
  status,
}: {
  status: "cancelled" | "no_show";
}) {
  const base = "inline-block px-2 py-[1px] rounded-full text-[9px]";
  if (status === "no_show") {
    return (
      <span className={`${base} bg-rose-500/20 text-rose-100`}>No-show</span>
    );
  }
  return (
    <span className={`${base} bg-amber-500/20 text-amber-100`}>Cancelado</span>
  );
}

function PayoutStatusBadge({
  status,
}: {
  status: "pending" | "paid" | string;
}) {
  const base = "inline-block px-2 py-[1px] rounded-full text-[9px]";
  if (status === "paid") {
    return (
      <span className={`${base} bg-emerald-500/20 text-emerald-100`}>Pago</span>
    );
  }
  return (
    <span className={`${base} bg-amber-500/20 text-amber-100`}>Pendente</span>
  );
}
