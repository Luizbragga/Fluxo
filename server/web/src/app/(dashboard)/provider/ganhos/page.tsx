"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchMyEarnings,
  ProviderEarningsResponse,
} from "../_api/provider-earnings";

// ---------------- helpers ----------------

function formatEURFromCents(cents: number) {
  const value = (cents ?? 0) / 100;
  return value.toLocaleString("pt-PT", {
    style: "currency",
    currency: "EUR",
  });
}

function toYYYYMMDD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(d: Date, amount: number) {
  return new Date(d.getFullYear(), d.getMonth() + amount, 1, 0, 0, 0, 0);
}

// backend usa "to" exclusivo, então o último dia exibido = to - 1 dia
function displayEndInclusive(toExclusiveISOorDate: string | Date) {
  const t =
    toExclusiveISOorDate instanceof Date
      ? toExclusiveISOorDate
      : new Date(toExclusiveISOorDate);
  if (Number.isNaN(t.getTime())) return String(toExclusiveISOorDate);

  const end = new Date(t);
  end.setDate(end.getDate() - 1);

  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(end);
}

function formatDatePtShort(input: string | Date) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);

  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function normalizeStatus(raw: any) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();

  // concluídos
  if (
    s === "done" ||
    s === "completed" ||
    s === "concluido" ||
    s === "concluído"
  )
    return "done";

  // faltas / no-show
  if (
    s === "no_show" ||
    s === "noshow" ||
    s === "no-show" ||
    s === "faltou" ||
    s === "missed"
  )
    return "no_show";

  // cancelados
  if (
    s === "cancelled" ||
    s === "canceled" ||
    s === "cancelado" ||
    s === "cancelada" ||
    s === "cancel"
  )
    return "cancelled";

  return s;
}

function MiniBar({ value, color }: { value: number; color: string }) {
  const pct = clampPct(value);

  return (
    <div className="mt-2">
      {/* trilho (fundo visível) */}
      <div className="h-2 rounded-full border border-slate-500/60 bg-slate-950/60 overflow-hidden">
        {/* preenchimento */}
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            minWidth: pct > 0 ? "6px" : undefined,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

type Preset = "this_month" | "last_month" | "last_7" | "custom";

export default function ProviderEarningsPage() {
  const [data, setData] = useState<ProviderEarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [preset, setPreset] = useState<Preset>("this_month");

  // from/to EXCLUSIVO em ISO
  const [fromISO, setFromISO] = useState<string>(() => {
    const now = new Date();
    return startOfMonth(now).toISOString();
  });

  const [toISO, setToISO] = useState<string>(() => {
    const now = new Date();
    return addMonths(startOfMonth(now), 1).toISOString();
  });

  // inputs para "Personalizado"
  const [customFrom, setCustomFrom] = useState<string>(() =>
    toYYYYMMDD(startOfMonth(new Date()))
  );

  const [customTo, setCustomTo] = useState<string>(() => {
    const next = addMonths(startOfMonth(new Date()), 1);
    next.setDate(next.getDate() - 1);
    return toYYYYMMDD(next);
  });

  // quando trocar preset, recalcula from/to
  useEffect(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);

    if (preset === "this_month") {
      const from = monthStart;
      const toExclusive = addMonths(monthStart, 1);
      setFromISO(from.toISOString());
      setToISO(toExclusive.toISOString());
      setCustomFrom(toYYYYMMDD(from));
      const lastDay = new Date(toExclusive);
      lastDay.setDate(lastDay.getDate() - 1);
      setCustomTo(toYYYYMMDD(lastDay));
    }

    if (preset === "last_month") {
      const from = addMonths(monthStart, -1);
      const toExclusive = monthStart;
      setFromISO(from.toISOString());
      setToISO(toExclusive.toISOString());
      setCustomFrom(toYYYYMMDD(from));
      const lastDay = new Date(toExclusive);
      lastDay.setDate(lastDay.getDate() - 1);
      setCustomTo(toYYYYMMDD(lastDay));
    }

    if (preset === "last_7") {
      const from = new Date();
      from.setDate(from.getDate() - 7);
      from.setHours(0, 0, 0, 0);

      const toExclusive = new Date();
      toExclusive.setDate(toExclusive.getDate() + 1);
      toExclusive.setHours(0, 0, 0, 0);

      setFromISO(from.toISOString());
      setToISO(toExclusive.toISOString());
      setCustomFrom(toYYYYMMDD(from));
      const lastDay = new Date(toExclusive);
      lastDay.setDate(lastDay.getDate() - 1);
      setCustomTo(toYYYYMMDD(lastDay));
    }
  }, [preset]);

  // carrega dados sempre que from/to mudar
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetchMyEarnings({ from: fromISO, to: toISO });
        if (!alive) return;
        setData(res);
      } catch (e: any) {
        if (!alive) return;
        console.error(e);
        setError(e?.message ?? "Erro ao carregar ganhos.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [fromISO, toISO]);

  function applyCustom() {
    const [fy, fm, fd] = customFrom.split("-").map(Number);
    const [ty, tm, td] = customTo.split("-").map(Number);

    const from = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
    const toExclusive = new Date(ty, tm - 1, td, 0, 0, 0, 0);
    toExclusive.setDate(toExclusive.getDate() + 1);

    setFromISO(from.toISOString());
    setToISO(toExclusive.toISOString());
  }

  // ---------------- DERIVADOS (aqui fica a correção real) ----------------
  const derived = useMemo(() => {
    if (!data) return null;

    const all = data.appointments ?? [];
    const totalAll = all.length;

    const withStatus = all.map((a) => ({
      ...a,
      _status: normalizeStatus(a.status),
    }));

    const done = withStatus.filter((a) => a._status === "done");
    const noShow = withStatus.filter((a) => a._status === "no_show");
    const cancelled = withStatus.filter((a) => a._status === "cancelled");

    const doneCount = done.length;
    const noShowCount = noShow.length;
    const cancelledCount = cancelled.length;

    const doneRate = totalAll > 0 ? (doneCount / totalAll) * 100 : 0;
    const failedRate = totalAll > 0 ? (noShowCount / totalAll) * 100 : 0;
    const cancelledRate = totalAll > 0 ? (cancelledCount / totalAll) * 100 : 0;

    // ✅✅✅ TOTAIS 100% calculados SOMENTE em concluídos (done)
    const totalsDone = done.reduce(
      (acc, a) => {
        const service = a.servicePriceCents ?? 0;
        const provider = a.providerEarningsCents ?? 0;

        acc.servicePriceCents += service;
        acc.providerEarningsCents += provider;

        // casa = preço - comissão (se der negativo, zera)
        const house = Math.max(0, service - provider);
        acc.houseEarningsCents += house;

        return acc;
      },
      {
        servicePriceCents: 0,
        providerEarningsCents: 0,
        houseEarningsCents: 0,
      }
    );

    const ticketAvgCents =
      doneCount > 0 ? Math.round(totalsDone.servicePriceCents / doneCount) : 0;

    const avgCommission =
      doneCount > 0
        ? done.reduce((acc, a) => acc + (a.commissionPercentage ?? 0), 0) /
          doneCount
        : 0;

    // top serviços (apenas concluídos; share do total concluído)
    const byService = new Map<
      string,
      {
        serviceName: string;
        count: number;
        revenueCents: number;
      }
    >();

    for (const a of done) {
      const key = a.serviceName ?? "Serviço";
      const prev = byService.get(key) ?? {
        serviceName: key,
        count: 0,
        revenueCents: 0,
      };
      prev.count += 1;
      prev.revenueCents += a.servicePriceCents ?? 0;
      byService.set(key, prev);
    }

    const topServices = Array.from(byService.values())
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 4)
      .map((s) => {
        const sharePct =
          totalsDone.servicePriceCents > 0
            ? (s.revenueCents / totalsDone.servicePriceCents) * 100
            : 0;

        return { ...s, sharePct: clampPct(sharePct) };
      });

    // distribuição você vs casa (concluídos)
    const sum =
      totalsDone.providerEarningsCents + totalsDone.houseEarningsCents;
    const myPct = sum > 0 ? (totalsDone.providerEarningsCents / sum) * 100 : 0;

    return {
      withStatus,
      done,
      noShow,
      cancelled,
      totalsDone,
      kpis: {
        totalAll,
        doneCount,
        noShowCount,
        cancelledCount,
        doneRate: clampPct(doneRate),
        failedRate: clampPct(failedRate),
        cancelledRate: clampPct(cancelledRate),
        ticketAvgCents,
        avgCommission,
        myPct: clampPct(myPct),
      },
      topServices,
    };
  }, [data]);

  const totals = useMemo(() => {
    if (!derived) return null;
    return {
      totalServicos: formatEURFromCents(derived.totalsDone.servicePriceCents),
      meuTotal: formatEURFromCents(derived.totalsDone.providerEarningsCents),
      casaTotal: formatEURFromCents(derived.totalsDone.houseEarningsCents),
    };
  }, [derived]);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold text-slate-100">Ganhos</h1>
        <p className="mt-2 text-sm text-slate-400">Carregando...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold text-slate-100">Ganhos</h1>
        <p className="mt-2 text-sm text-rose-400">{error}</p>
      </div>
    );
  }

  if (!data || !derived || !totals) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold text-slate-100">Ganhos</h1>
        <p className="mt-2 text-sm text-slate-400">Sem dados.</p>
      </div>
    );
  }

  const myPct = derived.kpis.myPct;
  const housePct = clampPct(100 - myPct);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">Ganhos</h1>
            <p className="text-xs text-slate-400">
              Visão financeira do seu período: comissões, ticket médio e
              performance.
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1 text-xs text-slate-200">
                <span className="text-slate-400">Intervalo</span>
                <span className="font-medium">
                  {formatDatePtShort(data.from)}
                </span>
                <span className="text-slate-500">→</span>
                <span className="font-medium">
                  {displayEndInclusive(data.to)}
                </span>
              </span>

              <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1 text-[11px] text-slate-400">
                {preset === "this_month"
                  ? "Mensal"
                  : preset === "last_month"
                  ? "Mensal"
                  : preset === "last_7"
                  ? "7 dias"
                  : "Personalizado"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-950/40 text-[11px] text-slate-200 hover:border-slate-500"
              onClick={() => {
                const rows = derived.withStatus.map((a) => ({
                  id: a.id,
                  date: a.date,
                  service: a.serviceName,
                  status: normalizeStatus(a.status),
                  servicePriceCents: a.servicePriceCents,
                  providerEarningsCents: a.providerEarningsCents,
                  commissionPercentage: a.commissionPercentage,
                }));

                const header = Object.keys(rows[0] ?? {}).join(",");
                const body = rows
                  .map((r) =>
                    Object.values(r)
                      .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
                      .join(",")
                  )
                  .join("\n");

                const csv = `${header}\n${body}`;
                const blob = new Blob([csv], {
                  type: "text/csv;charset=utf-8;",
                });

                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "ganhos.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Exportar CSV
            </button>

            <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/70 p-[2px] text-[11px]">
              <button
                type="button"
                onClick={() => setPreset("this_month")}
                className={[
                  "px-3 py-1 rounded-md",
                  preset === "this_month"
                    ? "bg-emerald-600/20 text-emerald-200"
                    : "text-slate-400 hover:text-slate-200",
                ].join(" ")}
              >
                Este mês
              </button>
              <button
                type="button"
                onClick={() => setPreset("last_month")}
                className={[
                  "px-3 py-1 rounded-md",
                  preset === "last_month"
                    ? "bg-emerald-600/20 text-emerald-200"
                    : "text-slate-400 hover:text-slate-200",
                ].join(" ")}
              >
                Mês passado
              </button>
              <button
                type="button"
                onClick={() => setPreset("last_7")}
                className={[
                  "px-3 py-1 rounded-md",
                  preset === "last_7"
                    ? "bg-emerald-600/20 text-emerald-200"
                    : "text-slate-400 hover:text-slate-200",
                ].join(" ")}
              >
                7 dias
              </button>
              <button
                type="button"
                onClick={() => setPreset("custom")}
                className={[
                  "px-3 py-1 rounded-md",
                  preset === "custom"
                    ? "bg-emerald-600/20 text-emerald-200"
                    : "text-slate-400 hover:text-slate-200",
                ].join(" ")}
              >
                Personalizado
              </button>
            </div>
          </div>
        </div>

        {preset === "custom" && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <p className="text-[11px] text-slate-400 mb-1">De</p>
              <input
                type="date"
                className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-950/60 text-slate-200 text-xs"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>

            <div>
              <p className="text-[11px] text-slate-400 mb-1">Até</p>
              <input
                type="date"
                className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-950/60 text-slate-200 text-xs"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={applyCustom}
              className="px-3 py-2 rounded-lg border border-emerald-600 bg-emerald-600/20 text-[11px] text-emerald-100 hover:bg-emerald-600/30"
            >
              Aplicar
            </button>
          </div>
        )}

        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-400">
          Totais e métricas financeiras consideram{" "}
          <span className="text-slate-200 font-medium">
            apenas atendimentos concluídos
          </span>{" "}
          (status <span className="text-slate-200 font-medium">done</span>).
          Falhas/no-show e cancelamentos entram apenas na performance e lista.
        </div>
      </div>

      {/* Cards Totais (APENAS CONCLUÍDOS) */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-[11px] tracking-wide text-slate-400 uppercase">
            Total em serviços (concluídos)
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">
            {totals.totalServicos}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Soma do preço dos serviços concluídos no período
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 ring-1 ring-emerald-500/20">
          <p className="text-[11px] tracking-wide text-slate-400 uppercase">
            Meu ganho (concluídos)
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">
            {totals.meuTotal}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Comissão média:{" "}
            <span className="text-slate-200 font-medium">
              {Math.round(derived.kpis.avgCommission)}%
            </span>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-[11px] tracking-wide text-slate-400 uppercase">
            Ganho da casa (concluídos)
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">
            {totals.casaTotal}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Casa = preço do serviço − sua comissão (apenas concluídos)
          </p>
        </div>
      </div>

      {/* GRID: Performance + Distribuição + Top serviços */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Performance */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 lg:col-span-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] tracking-wide text-slate-400 uppercase">
              Performance
            </p>
            <p className="text-[11px] text-slate-500">
              {derived.kpis.totalAll} atend.
            </p>
          </div>

          <div className="mt-3 space-y-3">
            {/* Concluídos */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-200">
                  Atendimentos concluídos
                </p>
                <p className="text-xs text-slate-400">
                  {derived.kpis.doneCount} • {Math.round(derived.kpis.doneRate)}
                  %
                </p>
              </div>
              <MiniBar value={derived.kpis.doneRate} color="#10b981" />
            </div>

            {/* Faltas / no-show (AGORA COM BARRA GARANTIDA) */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-200">Faltas / no-show</p>
                <p className="text-xs text-slate-400">
                  {derived.kpis.noShowCount} •{" "}
                  {Math.round(derived.kpis.failedRate)}%
                </p>
              </div>
              <MiniBar value={derived.kpis.failedRate} color="#f59e0b" />
            </div>

            {/* Cancelamentos (AGORA COM BARRA GARANTIDA) */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-200">Cancelamentos</p>
                <p className="text-xs text-slate-400">
                  {derived.kpis.cancelledCount} •{" "}
                  {Math.round(derived.kpis.cancelledRate)}%
                </p>
              </div>
              <MiniBar value={derived.kpis.cancelledRate} color="#f43f5e" />
            </div>

            {/* Ticket médio */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-xs text-slate-400">
                Ticket médio (concluídos)
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-100">
                {formatEURFromCents(derived.kpis.ticketAvgCents)}
              </p>
              <p className="text-[11px] text-slate-500">
                Receita concluída ÷ nº concluídos
              </p>
            </div>
          </div>
        </div>

        {/* Distribuição + Top serviços */}
        <div className="lg:col-span-2 space-y-4">
          {/* Distribuição */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] tracking-wide text-slate-400 uppercase">
                  Distribuição
                </p>
                <p className="text-sm font-semibold text-slate-100">
                  Você vs Casa{" "}
                  <span className="text-slate-400">(concluídos)</span>
                </p>
              </div>

              <p className="text-[11px] text-slate-400">
                Total:{" "}
                <span className="text-slate-200 font-medium">
                  {totals.meuTotal}
                </span>{" "}
                /{" "}
                <span className="text-slate-200 font-medium">
                  {totals.casaTotal}
                </span>
              </p>
            </div>

            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>
                  Você:{" "}
                  <span className="text-slate-200 font-medium">
                    {totals.meuTotal} ({Math.round(myPct)}%)
                  </span>
                </span>
                <span>
                  Casa:{" "}
                  <span className="text-slate-200 font-medium">
                    {totals.casaTotal} ({Math.round(housePct)}%)
                  </span>
                </span>
              </div>

              <div className="mt-2 h-3 rounded-full border border-slate-500/60 bg-slate-950/60 overflow-hidden">
                <div
                  className="h-3 transition-all"
                  style={{
                    width: `${myPct}%`,
                    minWidth: myPct > 0 ? "6px" : undefined,
                    backgroundColor: "#10b981",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Top serviços */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-[11px] tracking-wide text-slate-400 uppercase">
                  Top serviços
                </p>
                <p className="text-sm font-semibold text-slate-100">
                  Onde você mais faturou no período
                </p>
              </div>
              <p className="text-[11px] text-slate-500">
                {derived.topServices.length} itens
              </p>
            </div>

            {derived.topServices.length === 0 ? (
              <div className="p-4 text-sm text-slate-400">
                Nenhum serviço concluído no período para calcular top serviços.
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {derived.topServices.map((s) => (
                  <div
                    key={s.serviceName}
                    className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100 truncate">
                          {s.serviceName}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {s.count} atendimento(s) • {Math.round(s.sharePct)}%
                          do total
                        </p>
                      </div>

                      <p className="text-sm font-semibold text-slate-100">
                        {formatEURFromCents(s.revenueCents)}
                      </p>
                    </div>

                    {/* ✅ barra garantida */}
                    <MiniBar value={s.sharePct} color="#10b981" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
        <div className="px-4 py-3 border-b border-slate-800">
          <p className="text-sm font-semibold text-slate-100">
            Atendimentos ({derived.withStatus.length})
          </p>
          <p className="text-[11px] text-slate-400">
            Totais acima consideram apenas{" "}
            <span className="text-slate-200 font-medium">concluídos</span>. Aqui
            você vê todos (concluídos, faltas e cancelamentos).
          </p>
        </div>

        <div className="divide-y divide-slate-800">
          {derived.withStatus.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">
              Nenhum atendimento no período.
            </div>
          ) : (
            derived.withStatus.map((a) => (
              <div key={a.id} className="p-4 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-slate-100 truncate">
                    {a.serviceName}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(a.date).toLocaleString("pt-PT")} •{" "}
                    <span className="text-slate-200">{a._status}</span> •{" "}
                    {a.commissionPercentage}%
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm text-slate-100">
                    {formatEURFromCents(a.providerEarningsCents)}
                  </p>
                  <p className="text-xs text-slate-400">
                    serviço: {formatEURFromCents(a.servicePriceCents)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
