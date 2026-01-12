"use client";

import { useEffect, useState } from "react";
import { fetchProviderMe, ProviderMeResponse } from "../_api/provider-me";

export default function ProviderProfilePage() {
  const [data, setData] = useState<ProviderMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      try {
        const res = await fetchProviderMe();
        setData(res);
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? "Erro ao carregar perfil do profissional.");
      } finally {
        setLoading(false);
      }
    }

    run();
  }, []);

  if (loading) return <div className="p-6">Carregando...</div>;
  if (error) return <div className="p-6 text-rose-400">{error}</div>;
  if (!data) return <div className="p-6">Sem dados.</div>;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Perfil</h1>
        <p className="mt-1 text-sm text-slate-400">
          Dados reais vindos de <code>/providers/me</code>.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-sm font-semibold text-slate-200">
            Dados do profissional
          </h2>

          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Nome</span>
              <span className="text-slate-100">{data.name}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Especialidade</span>
              <span className="text-slate-100">{data.specialty}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Ativo</span>
              <span className="text-slate-100">
                {data.active ? "Sim" : "Não"}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Provider ID</span>
              <span className="text-slate-100">{data.id}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-sm font-semibold text-slate-200">
            Conta (User) + Unidade
          </h2>

          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Email</span>
              <span className="text-slate-100">{data.user?.email ?? "-"}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Telefone</span>
              <span className="text-slate-100">{data.user?.phone ?? "-"}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Unidade</span>
              <span className="text-slate-100">
                {data.location?.name ?? "-"}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Location ID</span>
              <span className="text-slate-100">{data.locationId}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
