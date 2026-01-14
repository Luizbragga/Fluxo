"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchMyEarnings,
  ProviderEarningsResponse,
} from "../_api/provider-earnings";

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

// backend usa "to" exclusivo (ex.: 2026-02-01), então o último dia exibido = to - 1 dia
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
    month: "short",
    year: "numeric",
  }).format(end);
}

function formatDatePtShort(input: string | Date) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);

  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

type Preset = "this_month" | "last_month" | "last_7" | "custom";

export default function ProviderEarningsPage() {
  const [data, setData] = useState<ProviderEarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ default: mês atual (do dia 1 até o último dia)
  const [preset, setPreset] = useState<Preset>("this_month");

  // from/to EXCLUSIVO em ISO (mantém compatível com teu backend)
  const [fromISO, setFromISO] = useState<string>(() => {
    const now = new Date();
    return startOfMonth(now).toISOString();
  });
  const [toISO, setToISO] = useState<string>(() => {
    const now = new Date();
    return addMonths(startOfMonth(now), 1).toISOString(); // 1º dia do próximo mês (exclusivo)
  });

  // inputs para "Personalizado" (YYYY-MM-DD)
  const [customFrom, setCustomFrom] = useState<string>(() =>
    toYYYYMMDD(startOfMonth(new Date()))
  );
  const [customTo, setCustomTo] = useState<string>(() => {
    const next = addMonths(startOfMonth(new Date()), 1);
    // exibimos o último dia do mês no input:
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
      toExclusive.setHours(0, 0, 0, 0); // amanhã 00:00 (exclusivo)

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

  const totals = useMemo(() => {
    if (!data) return null;
    return {
      totalServicos: formatEURFromCents(data.totals.servicePriceCents),
      meuTotal: formatEURFromCents(data.totals.providerEarningsCents),
      casaTotal: formatEURFromCents(data.totals.houseEarningsCents),
    };
  }, [data]);

  function applyCustom() {
    // customTo é inclusivo no input, então convertemos para toExclusive = +1 dia 00:00
    const [fy, fm, fd] = customFrom.split("-").map(Number);
    const [ty, tm, td] = customTo.split("-").map(Number);

    const from = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
    const toExclusive = new Date(ty, tm - 1, td, 0, 0, 0, 0);
    toExclusive.setDate(toExclusive.getDate() + 1);

    setFromISO(from.toISOString());
    setToISO(toExclusive.toISOString());
  }

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

  if (!data || !totals) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold text-slate-100">Ganhos</h1>
        <p className="mt-2 text-sm text-slate-400">Sem dados.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header + Intervalo bonito e editável */}
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Ganhos</h1>

        <div className="mt-3 flex flex-col gap-3">
          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPreset("this_month")}
              className={`px-3 py-1 rounded-full border text-[11px] ${
                preset === "this_month"
                  ? "border-emerald-600 bg-emerald-600/15 text-emerald-200"
                  : "border-slate-800 bg-slate-900/40 text-slate-300"
              }`}
            >
              Este mês
            </button>

            <button
              type="button"
              onClick={() => setPreset("last_month")}
              className={`px-3 py-1 rounded-full border text-[11px] ${
                preset === "last_month"
                  ? "border-emerald-600 bg-emerald-600/15 text-emerald-200"
                  : "border-slate-800 bg-slate-900/40 text-slate-300"
              }`}
            >
              Mês passado
            </button>

            <button
              type="button"
              onClick={() => setPreset("last_7")}
              className={`px-3 py-1 rounded-full border text-[11px] ${
                preset === "last_7"
                  ? "border-emerald-600 bg-emerald-600/15 text-emerald-200"
                  : "border-slate-800 bg-slate-900/40 text-slate-300"
              }`}
            >
              Últimos 7 dias
            </button>

            <button
              type="button"
              onClick={() => setPreset("custom")}
              className={`px-3 py-1 rounded-full border text-[11px] ${
                preset === "custom"
                  ? "border-emerald-600 bg-emerald-600/15 text-emerald-200"
                  : "border-slate-800 bg-slate-900/40 text-slate-300"
              }`}
            >
              Personalizado
            </button>
          </div>

          {/* Linha do intervalo (bonita) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Intervalo</span>

            <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs text-slate-200">
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

          {/* Inputs do personalizado */}
          {preset === "custom" && (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <p className="text-[11px] text-slate-400 mb-1">De</p>
                <input
                  type="date"
                  className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-200 text-xs"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </div>

              <div>
                <p className="text-[11px] text-slate-400 mb-1">Até</p>
                <input
                  type="date"
                  className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-200 text-xs"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>

              <button
                type="button"
                onClick={applyCustom}
                className="px-3 py-2 rounded-lg border border-emerald-600 bg-emerald-600/20 text-[11px] text-emerald-100"
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-400">Total em serviços</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">
            {totals.totalServicos}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-400">Meu ganho (comissões)</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">
            {totals.meuTotal}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-400">Ganho da casa</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">
            {totals.casaTotal}
          </p>
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
        <div className="px-4 py-3 border-b border-slate-800">
          <p className="text-sm font-semibold text-slate-100">
            Atendimentos ({data.appointments.length})
          </p>
        </div>

        <div className="divide-y divide-slate-800">
          {data.appointments.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">
              Nenhum atendimento no período.
            </div>
          ) : (
            data.appointments.map((a) => (
              <div key={a.id} className="p-4 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-slate-100 truncate">
                    {a.serviceName}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(a.date).toLocaleString("pt-PT")} • {a.status} •{" "}
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
