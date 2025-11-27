"use client";

import { useEffect, useState } from "react";
import {
  fetchOwnerCustomers,
  type OwnerCustomer,
  type OwnerCustomerPlan,
  type OwnerCustomerAppointmentHistory,
} from "../_api/owner-customers";

export default function OwnerClientesPage() {
  const [customers, setCustomers] = useState<OwnerCustomer[]>([]);
  const [plans, setPlans] = useState<OwnerCustomerPlan[]>([]);
  const [history, setHistory] = useState<OwnerCustomerAppointmentHistory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchOwnerCustomers();

        setCustomers(data.customers);
        setPlans(data.plans);
        setHistory(data.history);
        setSelectedId(data.customers[0]?.id ?? null);
        setError(null);
      } catch (err: any) {
        console.error(err);
        setError(err?.message ?? "Erro ao carregar clientes. Tente novamente.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const selectedCustomer = customers.find((c) => c.id === selectedId) ?? null;

  const selectedPlan = selectedCustomer
    ? plans.find((p) => p.customerId === selectedCustomer.id) ?? null
    : null;

  const selectedHistory = selectedCustomer
    ? history.filter((h) => h.customerId === selectedCustomer.id)
    : [];

  return (
    <>
      {/* Cabeçalho */}
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Clientes</h1>
          <p className="text-xs text-slate-400">
            Gestão de clientes, histórico de visitas e planos ativos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80">
            Todos
          </button>
          <button className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80">
            Com plano
          </button>
          <button className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80">
            Sem plano
          </button>
          <button className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200">
            + Adicionar cliente
          </button>
        </div>
      </header>

      {/* Grid principal: lista + detalhes */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lista de clientes */}
        <div className="lg:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3 text-xs">
            <p className="text-slate-400">Lista de clientes</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Exportar
            </button>
          </div>

          <div className="mb-3">
            <input
              placeholder="Buscar por nome ou telefone..."
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {loading ? (
            <p className="text-xs text-slate-400">Carregando clientes…</p>
          ) : error ? (
            <p className="text-xs text-rose-400">
              Erro ao carregar clientes: {error}
            </p>
          ) : customers.length === 0 ? (
            <p className="text-xs text-slate-400">
              Ainda não há clientes registados neste tenant.
            </p>
          ) : (
            <div className="space-y-2 text-xs">
              {customers.map((customer) => {
                const isSelected = customer.id === selectedId;

                return (
                  <button
                    key={customer.id}
                    onClick={() => setSelectedId(customer.id)}
                    className={[
                      "w-full text-left rounded-xl border px-3 py-2 transition-colors",
                      isSelected
                        ? "border-emerald-500/60 bg-emerald-500/5"
                        : "border-slate-800 bg-slate-950/60 hover:border-slate-700",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-[13px]">
                          {customer.name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {customer.phone}
                        </p>
                        {customer.lastVisitDate && (
                          <p className="text-[10px] text-slate-500">
                            Última visita: {customer.lastVisitDate}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-slate-400">Visitas</p>
                        <p className="text-sm font-semibold">
                          {customer.totalVisits}
                        </p>
                        {customer.hasActivePlan ? (
                          <span className="inline-flex mt-1 rounded-full px-2 py-[1px] text-[9px] bg-emerald-500/15 text-emerald-300">
                            Plano ativo
                          </span>
                        ) : (
                          <span className="inline-flex mt-1 rounded-full px-2 py-[1px] text-[9px] bg-slate-700 text-slate-200">
                            Sem plano
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detalhes do cliente selecionado */}
        <div className="lg:col-span-2 space-y-4">
          {/* Cabeçalho do cliente + plano */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            {selectedCustomer ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-slate-400">Cliente</p>
                    <p className="text-sm font-semibold">
                      {selectedCustomer.name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {selectedCustomer.phone}
                    </p>
                    {selectedCustomer.nextVisitDate && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Próxima visita: {selectedCustomer.nextVisitDate}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-slate-400">Visitas totais</p>
                    <p className="text-lg font-semibold">
                      {selectedCustomer.totalVisits}
                    </p>
                    {selectedCustomer.lastVisitDate && (
                      <p className="text-[11px] text-slate-500">
                        Última em {selectedCustomer.lastVisitDate}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">Plano atual</p>
                    {selectedPlan && selectedPlan.status !== "none" ? (
                      <>
                        <p className="mt-1 text-sm font-semibold">
                          {selectedPlan.planName}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {selectedPlan.visitsUsed} de{" "}
                          {selectedPlan.visitsTotal} visitas usadas
                        </p>
                        {selectedPlan.renewsAt && (
                          <p className="mt-1 text-[11px] text-slate-500">
                            Renova em {selectedPlan.renewsAt}
                          </p>
                        )}
                        {selectedPlan.nextChargeAmount && (
                          <p className="mt-1 text-[11px] text-slate-500">
                            Próxima cobrança: € {selectedPlan.nextChargeAmount}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Cliente sem plano ativo. Depois vamos permitir atribuir
                        um plano diretamente aqui.
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">Ações rápidas</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[11px] hover:border-emerald-500">
                        Criar agendamento
                      </button>
                      <button className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[11px] hover:border-emerald-500">
                        Registrar pagamento de plano
                      </button>
                      <button className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[11px] hover:border-emerald-500">
                        Ver perfil financeiro
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">
                Selecione um cliente na lista ao lado para ver o detalhe.
              </p>
            )}
          </div>

          {/* Histórico de visitas */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-400">Histórico de visitas</p>
              <button className="text-[11px] text-emerald-400 hover:underline">
                Ver todos
              </button>
            </div>

            {selectedHistory.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                Ainda não há visitas ligadas nesta vista. Em breve vamos puxar o
                histórico real da agenda.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedHistory.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-[11px] text-slate-300">
                        {h.date} · {h.time}
                      </p>
                      <p className="text-[11px] font-medium">{h.serviceName}</p>
                      <p className="text-[10px] text-slate-400">
                        {h.professionalName}
                      </p>
                    </div>
                    <div className="text-right">
                      <SourceBadge source={h.source} />
                      <StatusBadge status={h.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function SourceBadge({
  source,
}: {
  source: OwnerCustomerAppointmentHistory["source"];
}) {
  const base = "inline-block mb-1 px-2 py-[1px] rounded-full text-[9px]";
  switch (source) {
    case "plan":
      return (
        <span className={`${base} bg-emerald-500/20 text-emerald-100`}>
          Plano
        </span>
      );
    case "single":
      return (
        <span className={`${base} bg-slate-700 text-slate-100`}>Avulso</span>
      );
    case "walk_in":
      return (
        <span className={`${base} bg-sky-500/20 text-sky-100`}>Walk-in</span>
      );
    case "app":
      return (
        <span className={`${base} bg-indigo-500/20 text-indigo-100`}>App</span>
      );
    default:
      return null;
  }
}

function StatusBadge({
  status,
}: {
  status: OwnerCustomerAppointmentHistory["status"];
}) {
  const base = "inline-block px-2 py-[1px] rounded-full text-[9px] ml-1";
  switch (status) {
    case "done":
      return (
        <span className={`${base} bg-emerald-500/20 text-emerald-100`}>
          Concluído
        </span>
      );
    case "no_show":
      return (
        <span className={`${base} bg-amber-500/20 text-amber-100`}>Falta</span>
      );
    case "cancelled":
      return (
        <span className={`${base} bg-rose-500/20 text-rose-100`}>
          Cancelado
        </span>
      );
    default:
      return null;
  }
}
