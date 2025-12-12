"use client";

import { useEffect, useState } from "react";
import {
  fetchOwnerLocations,
  type OwnerLocation,
  type LocationsPaginationMeta,
} from "../_api/owner-locations";

export default function OwnerUnidadesPage() {
  const [locations, setLocations] = useState<OwnerLocation[]>([]);
  const [meta, setMeta] = useState<LocationsPaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const result = await fetchOwnerLocations({
          page: 1,
          pageSize: 20,
        });

        if (!cancelled) {
          setLocations(result.data);
          setMeta(result.meta);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error(err);
          setError("Não foi possível carregar as unidades.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Unidades</h1>
        <p className="mt-1 text-sm text-slate-400">
          Gerencie as filiais do seu negócio (nome, endereço e horários padrão).
        </p>
      </div>

      {/* Estado de erro */}
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Estado de loading */}
      {loading && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-400">
          Carregando unidades...
        </div>
      )}

      {/* Lista de unidades */}
      {!loading && !error && locations.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-400">
          Nenhuma unidade cadastrada ainda. Em breve vamos permitir criar e
          configurar horários padrão por aqui.
        </div>
      )}

      {!loading && !error && locations.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-100">
              {meta?.total ?? locations.length}{" "}
              {locations.length === 1 ? "unidade" : "unidades"} cadastrada
              {locations.length === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-slate-400">
              Em breve: criação/edição de unidade e configuração de horários
              padrão.
            </p>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Nome</th>
                <th className="px-4 py-3 text-left">Slug</th>
                <th className="px-4 py-3 text-left">Horário padrão</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((location) => {
                const hasTemplate =
                  location.businessHoursTemplate &&
                  Object.keys(location.businessHoursTemplate).length > 0;

                return (
                  <tr
                    key={location.id}
                    className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-900/60"
                  >
                    <td className="px-4 py-3 align-top text-slate-100">
                      <div className="font-medium">{location.name}</div>
                      <div className="text-xs text-slate-400">
                        ID: {location.id}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-slate-300 text-xs">
                      {location.slug}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-300 text-xs">
                      {hasTemplate ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 border border-emerald-500/30">
                          Horário padrão configurado
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 border border-slate-700">
                          Sem horário padrão
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-xs">
                      {location.active ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 border border-emerald-500/30">
                          Ativa
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 border border-slate-700">
                          Inativa
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
