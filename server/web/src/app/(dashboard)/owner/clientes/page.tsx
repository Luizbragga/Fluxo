"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  fetchOwnerCustomers,
  registerCustomerPlanPayment,
  type OwnerCustomer,
  type OwnerCustomerPlan,
  type OwnerCustomerAppointmentHistory,
} from "../_api/owner-customers";

// Filtro de frequência de visita
type LastVisitFilter = "all" | "never" | "15_plus" | "30_plus" | "90_plus";

export default function OwnerClientesPage() {
  const [customers, setCustomers] = useState<OwnerCustomer[]>([]);
  const [plans, setPlans] = useState<OwnerCustomerPlan[]>([]);
  const [history, setHistory] = useState<OwnerCustomerAppointmentHistory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [filterType, setFilterType] = useState<
    "all" | "withPlan" | "withoutPlan"
  >("all");
  const [lastVisitFilter, setLastVisitFilter] =
    useState<LastVisitFilter>("all");

  // Modal de registro de pagamento de plano
  const [isRegisterPaymentOpen, setIsRegisterPaymentOpen] = useState(false);
  const [registerPaymentAmount, setRegisterPaymentAmount] =
    useState<string>("");
  const [registerPaymentDate, setRegisterPaymentDate] = useState<string>("");
  const [registerPaymentMethod, setRegisterPaymentMethod] =
    useState<string>("mbway");
  const [registerPaymentError, setRegisterPaymentError] = useState<
    string | null
  >(null);
  const [savingRegisterPayment, setSavingRegisterPayment] = useState(false);

  // Modal de perfil financeiro
  const [isFinancialProfileOpen, setIsFinancialProfileOpen] = useState(false);
  const [financialYear, setFinancialYear] = useState<number | null>(null);
  const [financialMonth, setFinancialMonth] = useState<"all" | number>("all");

  // Modal de histórico completo
  const [isFullHistoryOpen, setIsFullHistoryOpen] = useState(false);

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
  // Mapa: última visita CONCLUÍDA de cada cliente (baseado no histórico real)
  const lastDoneVisitByCustomerId = new Map<string, Date>();

  for (const h of history) {
    if (h.status !== "done") continue;

    // h.date vem em formato local ("04/12/2025" ou "04 dez 2025").
    // Pegamos só o dia pelo início da string.
    const dayMatch = h.date.match(/^(\d{1,2})/);
    const day = dayMatch ? Number(dayMatch[1]) || 1 : 1;

    const visitDate = new Date(Date.UTC(h.year, h.month - 1, day));

    const current = lastDoneVisitByCustomerId.get(h.customerId);
    if (!current || visitDate > current) {
      lastDoneVisitByCustomerId.set(h.customerId, visitDate);
    }
  }

  // Aplica os mesmos filtros usados na lista (plano + frequência)
  const filteredCustomers: OwnerCustomer[] = customers
    .filter((customer) => {
      if (filterType === "withPlan") {
        return customer.hasActivePlan;
      }
      if (filterType === "withoutPlan") {
        return !customer.hasActivePlan;
      }
      return true; // "all"
    })
    .filter((customer) => {
      if (lastVisitFilter === "all") return true;

      // Clientes com plano ativo não entram nos filtros de "sem visita X dias"
      // (como você comentou que não faz sentido aparecerem aí).
      if (
        customer.hasActivePlan &&
        (lastVisitFilter === "15_plus" ||
          lastVisitFilter === "30_plus" ||
          lastVisitFilter === "90_plus")
      ) {
        return false;
      }

      const lastVisitDate = lastDoneVisitByCustomerId.get(customer.id);

      // Nunca teve visita concluída
      if (!lastVisitDate) {
        return lastVisitFilter === "never";
      }

      const diffMs = Date.now() - lastVisitDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (lastVisitFilter === "15_plus") return diffDays >= 15;
      if (lastVisitFilter === "30_plus") return diffDays >= 30;
      if (lastVisitFilter === "90_plus") return diffDays >= 90;
      if (lastVisitFilter === "never") return false; // já tratamos acima

      return true;
    });

  async function handleConfirmRegisterPayment() {
    if (!selectedCustomer || !selectedPlan) return;

    if (!registerPaymentAmount.trim()) {
      setRegisterPaymentError("Informe o valor pago.");
      return;
    }

    const normalized = registerPaymentAmount.replace(",", ".");
    const valueNumber = Number(normalized);

    if (!Number.isFinite(valueNumber) || valueNumber <= 0) {
      setRegisterPaymentError("Valor inválido.");
      return;
    }

    const amountCents = Math.round(valueNumber * 100);

    const paidAt =
      registerPaymentDate && registerPaymentDate.trim().length > 0
        ? registerPaymentDate
        : new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

    setRegisterPaymentError(null);
    setSavingRegisterPayment(true);

    try {
      // 1) CHAMA BACKEND REAL
      await registerCustomerPlanPayment({
        customerPlanId: selectedPlan.id,
        amountCents,
        paidAt,
      });

      // 2) Atualiza estado local só para refletir visualmente
      setPlans((prev) =>
        prev.map((plan) => {
          if (plan.id !== selectedPlan.id) return plan;

          return {
            ...plan,
            status: "active",
            renewsAt: plan.renewsAt ?? paidAt,
          };
        })
      );

      // 3) Fecha modal e limpa campos
      setIsRegisterPaymentOpen(false);
      setRegisterPaymentAmount("");
      setRegisterPaymentDate("");
      setRegisterPaymentMethod("mbway");
    } catch (err: any) {
      console.error(err);
      setRegisterPaymentError(
        err?.message ?? "Não foi possível registar o pagamento."
      );
    } finally {
      setSavingRegisterPayment(false);
    }
  }

  // Exporta lista (já filtrada) de clientes para CSV
  function handleExportCustomers(customersToExport: OwnerCustomer[]) {
    if (!customersToExport || customersToExport.length === 0) {
      return;
    }

    const header = [
      "Nome",
      "Telefone",
      "Tem plano ativo",
      "Plano",
      "Última visita",
      "Próxima visita",
      "Total de visitas",
    ];

    const rows = customersToExport.map((c) => [
      c.name ?? "",
      c.phone ?? "",
      c.hasActivePlan ? "Sim" : "Não",
      c.planName ?? "",
      c.lastVisitDate ?? "",
      c.nextVisitDate ?? "",
      String(c.totalVisits ?? 0),
    ]);

    const csvContent = [header, ...rows]
      .map((row) =>
        row
          .map((field) => `"${String(field ?? "").replace(/"/g, '""')}"`)
          .join(";")
      )
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "clientes-fluxo.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

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

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1 text-[11px] rounded-lg border ${
              filterType === "all"
                ? "bg-emerald-600/20 border-emerald-600 text-emerald-200"
                : "border-slate-600 text-slate-400 hover:text-emerald-300"
            }`}
          >
            Todos
          </button>

          <button
            onClick={() => setFilterType("withPlan")}
            className={`px-3 py-1 text-[11px] rounded-lg border ${
              filterType === "withPlan"
                ? "bg-emerald-600/20 border-emerald-600 text-emerald-200"
                : "border-slate-600 text-slate-400 hover:text-emerald-300"
            }`}
          >
            Com plano
          </button>

          <button
            onClick={() => setFilterType("withoutPlan")}
            className={`px-3 py-1 text-[11px] rounded-lg border ${
              filterType === "withoutPlan"
                ? "bg-emerald-600/20 border-emerald-600 text-emerald-200"
                : "border-slate-600 text-slate-400 hover:text-emerald-300"
            }`}
          >
            Sem plano
          </button>

          <button
            type="button"
            onClick={() => router.push("/owner/agenda")}
            className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-[11px] text-emerald-200"
          >
            Criar agendamento
          </button>
        </div>
      </header>

      {/* Grid principal: lista + detalhes */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lista de clientes */}
        <div className="lg:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3 text-xs">
            <p className="text-slate-400">Lista de clientes</p>

            <div className="flex items-center gap-2">
              <select
                value={lastVisitFilter}
                onChange={(e) =>
                  setLastVisitFilter(e.target.value as LastVisitFilter)
                }
                className="rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="all">Todos</option>
                <option value="never">Nunca visitaram</option>
                <option value="15_plus">Sem visita há 15+ dias</option>
                <option value="30_plus">Sem visita há 30+ dias</option>
                <option value="90_plus">Sem visita há 3+ meses</option>
              </select>

              <button
                className="text-[11px] text-emerald-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                type="button"
                disabled={filteredCustomers.length === 0}
                onClick={() => handleExportCustomers(filteredCustomers)}
              >
                Exportar
              </button>
            </div>
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
              {filteredCustomers.map((customer) => {
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
                      <div className="mt-1 space-y-2">
                        <p className="text-[11px] text-slate-400">
                          Cliente sem plano ativo. Você pode atribuir um plano
                          para este cliente.
                        </p>

                        <button
                          className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-[11px] text-emerald-200"
                          onClick={() => {
                            if (!selectedCustomer) return;

                            const params = new URLSearchParams({
                              customerName: selectedCustomer.name,
                              customerPhone: selectedCustomer.phone,
                            });

                            const qs = params.toString();
                            router.push(
                              qs ? `/owner/planos?${qs}` : "/owner/planos"
                            );
                          }}
                        >
                          Atribuir plano a este cliente
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">Ações rápidas</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[11px] hover:border-emerald-500"
                        disabled={!selectedCustomer}
                        onClick={() => {
                          if (!selectedCustomer) return;

                          const params = new URLSearchParams({
                            customerName: selectedCustomer.name,
                            customerPhone: selectedCustomer.phone,
                          });

                          // Se o cliente tiver um plano ativo, já mandamos o id do plano na URL
                          if (
                            selectedPlan &&
                            selectedPlan.status === "active"
                          ) {
                            params.set("customerPlanId", selectedPlan.id);
                          }

                          router.push(`/owner/agenda?${params.toString()}`);
                        }}
                      >
                        Criar agendamento
                      </button>

                      <button
                        className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[11px] hover:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={
                          !selectedPlan || selectedPlan.status === "none"
                        }
                        onClick={() => {
                          if (!selectedPlan || selectedPlan.status === "none")
                            return;

                          const defaultAmount = selectedPlan.nextChargeAmount
                            ? String(selectedPlan.nextChargeAmount)
                            : "";

                          setRegisterPaymentAmount(defaultAmount);
                          setRegisterPaymentDate(
                            new Date().toISOString().slice(0, 10)
                          ); // hoje (YYYY-MM-DD)
                          setRegisterPaymentMethod("mbway");
                          setRegisterPaymentError(null);
                          setIsRegisterPaymentOpen(true);
                        }}
                      >
                        Registrar pagamento de plano
                      </button>

                      <button
                        className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[11px] hover:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={!selectedCustomer}
                        onClick={() => {
                          if (!selectedCustomer) return;

                          const customerHistory = selectedHistory;
                          const years = Array.from(
                            new Set(customerHistory.map((h) => h.year))
                          ).sort((a, b) => b - a);

                          const defaultYear =
                            years.length > 0
                              ? years[0]
                              : new Date().getFullYear();

                          setFinancialYear(defaultYear);
                          setFinancialMonth("all");
                          setIsFinancialProfileOpen(true);
                        }}
                      >
                        Ver perfil financeiro
                      </button>
                    </div>
                  </div>
                </div>

                {isRegisterPaymentOpen && selectedCustomer && selectedPlan && (
                  <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
                    <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs shadow-xl">
                      {/* Cabeçalho */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            Registrar pagamento de plano
                          </p>
                          <p className="text-sm font-semibold text-slate-100">
                            {selectedCustomer.name}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {selectedCustomer.phone}
                          </p>
                          {selectedPlan.planName && (
                            <p className="mt-1 text-[11px] text-slate-400">
                              Plano: {selectedPlan.planName}
                            </p>
                          )}
                        </div>
                        <button
                          className="text-[11px] text-slate-400 hover:text-slate-100"
                          onClick={() => setIsRegisterPaymentOpen(false)}
                        >
                          Fechar
                        </button>
                      </div>

                      {/* Campos */}
                      <div className="space-y-3 mb-3">
                        <div>
                          <p className="text-[11px] text-slate-400 mb-1">
                            Forma de pagamento
                          </p>
                          <select
                            className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-100"
                            value={registerPaymentMethod}
                            onChange={(e) =>
                              setRegisterPaymentMethod(e.target.value)
                            }
                          >
                            <option value="mbway">MB Way</option>
                            <option value="card">Cartão</option>
                            <option value="cash">Dinheiro</option>
                            <option value="transfer">Transferência</option>
                          </select>
                        </div>

                        <div>
                          <p className="text-[11px] text-slate-400 mb-1">
                            Data do pagamento
                          </p>
                          <input
                            type="date"
                            className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-100"
                            value={registerPaymentDate}
                            onChange={(e) =>
                              setRegisterPaymentDate(e.target.value)
                            }
                          />
                        </div>

                        <div>
                          <p className="text-[11px] text-slate-400 mb-1">
                            Valor pago (€)
                          </p>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-100"
                            value={registerPaymentAmount}
                            onChange={(e) =>
                              setRegisterPaymentAmount(e.target.value)
                            }
                          />
                        </div>
                      </div>

                      {registerPaymentError && (
                        <p className="mb-3 text-[11px] text-rose-400">
                          {registerPaymentError}
                        </p>
                      )}

                      {/* Botões */}
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[11px]"
                          type="button"
                          onClick={() => setIsRegisterPaymentOpen(false)}
                        >
                          Cancelar
                        </button>
                        <button
                          className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-[11px] text-emerald-100 disabled:opacity-60"
                          type="button"
                          onClick={handleConfirmRegisterPayment}
                          disabled={savingRegisterPayment}
                        >
                          {savingRegisterPayment
                            ? "Salvando..."
                            : "Salvar pagamento"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {isFinancialProfileOpen && selectedCustomer && (
                  <FinancialProfileModal
                    customer={selectedCustomer}
                    history={selectedHistory}
                    year={financialYear}
                    month={financialMonth}
                    onClose={() => setIsFinancialProfileOpen(false)}
                    onChangeYear={(y) => setFinancialYear(y)}
                    onChangeMonth={(m) => setFinancialMonth(m)}
                  />
                )}

                {isFullHistoryOpen && selectedCustomer && (
                  <FullHistoryModal
                    customer={selectedCustomer}
                    history={selectedHistory}
                    onClose={() => setIsFullHistoryOpen(false)}
                  />
                )}
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
              <button
                className="text-[11px] text-emerald-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                type="button"
                disabled={!selectedCustomer || selectedHistory.length === 0}
                onClick={() => {
                  if (!selectedCustomer || selectedHistory.length === 0) return;
                  setIsFullHistoryOpen(true);
                }}
              >
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

type FinancialProfileModalProps = {
  customer: OwnerCustomer;
  history: OwnerCustomerAppointmentHistory[];
  year: number | null;
  month: "all" | number;
  onClose: () => void;
  onChangeYear: (year: number) => void;
  onChangeMonth: (month: "all" | number) => void;
};

const MONTH_OPTIONS: { value: "all" | number; label: string }[] = [
  { value: "all", label: "Todos os meses" },
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

function FinancialProfileModal({
  customer,
  history,
  year,
  month,
  onClose,
  onChangeYear,
  onChangeMonth,
}: FinancialProfileModalProps) {
  const availableYears = Array.from(new Set(history.map((h) => h.year))).sort(
    (a, b) => b - a
  );

  const activeYear =
    year && availableYears.includes(year)
      ? year
      : availableYears[0] ?? new Date().getFullYear();

  const yearHistory = history.filter((h) => h.year === activeYear);

  const periodHistory =
    month === "all"
      ? yearHistory
      : yearHistory.filter((h) => h.month === month);

  // ---- Métricas anuais ----
  const totalVisitsYear = yearHistory.filter((h) => h.status === "done").length;

  const totalPlanVisitsYear = yearHistory.filter(
    (h) => h.status === "done" && h.source === "plan"
  ).length;

  const totalSingleVisitsYear = yearHistory.filter(
    (h) => h.status === "done" && h.source === "single"
  ).length;

  const totalSpentYear = yearHistory.reduce(
    (sum, h) => (h.status === "done" ? sum + h.price : sum),
    0
  );

  const monthsWithVisits = new Set(yearHistory.map((h) => h.month)).size || 1;
  const avgVisitsPerMonth = totalVisitsYear / monthsWithVisits;

  // ---- Métricas do período (mês selecionado ou todos) ----
  const totalVisitsPeriod = periodHistory.filter(
    (h) => h.status === "done"
  ).length;

  const totalPlanVisitsPeriod = periodHistory.filter(
    (h) => h.status === "done" && h.source === "plan"
  ).length;

  const totalSingleVisitsPeriod = periodHistory.filter(
    (h) => h.status === "done" && h.source === "single"
  ).length;

  const totalSpentPeriod = periodHistory.reduce(
    (sum, h) => (h.status === "done" ? sum + h.price : sum),
    0
  );

  // Serviços mais usados no período
  const serviceCount = new Map<string, number>();
  periodHistory.forEach((h) => {
    if (h.status !== "done") return;
    serviceCount.set(h.serviceName, (serviceCount.get(h.serviceName) ?? 0) + 1);
  });

  const topServices = Array.from(serviceCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const formatMoney = (value: number) =>
    value.toLocaleString("pt-PT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs shadow-xl">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              Perfil financeiro do cliente
            </p>
            <p className="text-sm font-semibold text-slate-100">
              {customer.name}
            </p>
            <p className="text-[11px] text-slate-400">{customer.phone}</p>
          </div>
          <button
            className="text-[11px] text-slate-400 hover:text-slate-100"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>

        {/* Filtros */}
        <div className="mb-4 flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1 text-[11px] text-slate-100"
            value={activeYear}
            onChange={(e) => onChangeYear(Number(e.target.value))}
          >
            {availableYears.length === 0 ? (
              <option value={activeYear}>{activeYear}</option>
            ) : (
              availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))
            )}
          </select>

          <select
            className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1 text-[11px] text-slate-100"
            value={month === "all" ? "all" : String(month)}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "all") {
                onChangeMonth("all");
              } else {
                onChangeMonth(Number(value) as number);
              }
            }}
          >
            {MONTH_OPTIONS.map((m) => (
              <option
                key={m.value === "all" ? "all" : m.value}
                value={m.value === "all" ? "all" : String(m.value)}
              >
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
            <p className="text-[11px] text-slate-400">Visitas no ano</p>
            <p className="mt-1 text-lg font-semibold">{totalVisitsYear}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Plano: {totalPlanVisitsYear} · Avulsas: {totalSingleVisitsYear}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
            <p className="text-[11px] text-slate-400">Média de visitas / mês</p>
            <p className="mt-1 text-lg font-semibold">
              {avgVisitsPerMonth.toFixed(1)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
            <p className="text-[11px] text-slate-400">Gasto no ano</p>
            <p className="mt-1 text-lg font-semibold">
              {formatMoney(totalSpentYear)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
            <p className="text-[11px] text-slate-400">
              Gasto no período selecionado
            </p>
            <p className="mt-1 text-lg font-semibold">
              {formatMoney(totalSpentPeriod)}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Visitas de plano: {totalPlanVisitsPeriod} · Avulsas:{" "}
              {totalSingleVisitsPeriod}
            </p>
          </div>
        </div>

        {/* Serviços mais usados + lista de visitas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
            <p className="text-[11px] text-slate-400 mb-2">
              Serviços mais utilizados
            </p>
            {topServices.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                Ainda não há serviços concluídos no período selecionado.
              </p>
            ) : (
              <ul className="space-y-1">
                {topServices.map(([serviceName, count]) => (
                  <li
                    key={serviceName}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span>{serviceName}</span>
                    <span className="text-slate-300">{count}x</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
            <p className="text-[11px] text-slate-400 mb-2">
              Visitas no período selecionado ({totalVisitsPeriod})
            </p>
            {periodHistory.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                Sem visitas no período selecionado.
              </p>
            ) : (
              <div className="max-h-52 overflow-y-auto space-y-2">
                {periodHistory.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 flex items-center justify-between"
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
                    <div className="text-right text-[11px]">
                      <p className="text-slate-200">{formatMoney(h.price)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type FullHistoryModalProps = {
  customer: OwnerCustomer;
  history: OwnerCustomerAppointmentHistory[];
  onClose: () => void;
};

function FullHistoryModal({
  customer,
  history,
  onClose,
}: FullHistoryModalProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs shadow-xl">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              Histórico completo de visitas
            </p>
            <p className="text-sm font-semibold text-slate-100">
              {customer.name}
            </p>
            <p className="text-[11px] text-slate-400">{customer.phone}</p>
          </div>
          <button
            className="text-[11px] text-slate-400 hover:text-slate-100"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>

        {history.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            Ainda não há visitas registadas para este cliente.
          </p>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto space-y-2 pr-1">
            {history.map((h) => (
              <div
                key={h.id}
                className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 flex items-center justify-between"
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
  );
}
