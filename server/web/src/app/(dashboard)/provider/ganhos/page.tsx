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

export default function ProviderEarningsPage() {
  const [data, setData] = useState<ProviderEarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // backend já tem default de intervalo (mês atual) quando não envia from/to
        const res = await fetchMyEarnings();

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
  }, []);

  const totals = useMemo(() => {
    if (!data) return null;
    return {
      totalServicos: formatEURFromCents(data.totals.servicePriceCents),
      meuTotal: formatEURFromCents(data.totals.providerEarningsCents),
      casaTotal: formatEURFromCents(data.totals.houseEarningsCents),
    };
  }, [data]);

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
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Ganhos</h1>
        <p className="mt-2 text-sm text-slate-400">
          Intervalo: <span className="text-slate-200">{data.from}</span> até{" "}
          <span className="text-slate-200">{data.to}</span>
        </p>
      </div>

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
