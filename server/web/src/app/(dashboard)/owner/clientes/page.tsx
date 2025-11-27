// src/app/(dashboard)/owner/clientes/page.tsx

type Customer = {
  id: string;
  name: string;
  phone: string;
  hasActivePlan: boolean;
  planName?: string;
  lastVisitDate?: string; // "18 Nov 2025"
  nextVisitDate?: string;
  totalVisits: number;
};

type CustomerPlanInfo = {
  customerId: string;
  planName: string;
  status: "active" | "paused" | "cancelled" | "none";
  visitsUsed: number;
  visitsTotal: number;
  renewsAt?: string;
  nextChargeAmount?: number;
};

type CustomerAppointmentHistory = {
  id: string;
  customerId: string;
  date: string; // "18 Nov 2025"
  time: string; // "09:00"
  professionalName: string;
  serviceName: string;
  source: "plan" | "single" | "walk_in" | "app";
  status: "done" | "no_show" | "cancelled";
};

const customers: Customer[] = [
  {
    id: "1",
    name: "Miguel Silva",
    phone: "+351 912 345 678",
    hasActivePlan: true,
    planName: "Plano Corte Mensal",
    lastVisitDate: "18 Nov 2025",
    nextVisitDate: "02 Dez 2025",
    totalVisits: 14,
  },
  {
    id: "2",
    name: "Bianca Costa",
    phone: "+351 934 222 111",
    hasActivePlan: true,
    planName: "Plano Nails Premium",
    lastVisitDate: "20 Nov 2025",
    nextVisitDate: "27 Nov 2025",
    totalVisits: 9,
  },
  {
    id: "3",
    name: "Carlos Andrade",
    phone: "+351 968 555 000",
    hasActivePlan: false,
    lastVisitDate: "05 Nov 2025",
    totalVisits: 3,
  },
];

const customerPlans: CustomerPlanInfo[] = [
  {
    customerId: "1",
    planName: "Plano Corte Mensal",
    status: "active",
    visitsUsed: 2,
    visitsTotal: 4,
    renewsAt: "02 Jan 2026",
    nextChargeAmount: 45,
  },
  {
    customerId: "2",
    planName: "Plano Nails Premium",
    status: "active",
    visitsUsed: 3,
    visitsTotal: 6,
    renewsAt: "27 Dez 2025",
    nextChargeAmount: 65,
  },
  {
    customerId: "3",
    planName: "",
    status: "none",
    visitsUsed: 0,
    visitsTotal: 0,
  },
];

const appointmentHistory: CustomerAppointmentHistory[] = [
  {
    id: "h1",
    customerId: "1",
    date: "18 Nov 2025",
    time: "09:00",
    professionalName: "Rafa Barber",
    serviceName: "Corte + Barba",
    source: "plan",
    status: "done",
  },
  {
    id: "h2",
    customerId: "1",
    date: "04 Nov 2025",
    time: "18:30",
    professionalName: "João Fade",
    serviceName: "Corte masculino",
    source: "single",
    status: "done",
  },
  {
    id: "h3",
    customerId: "2",
    date: "20 Nov 2025",
    time: "15:00",
    professionalName: "Ana Nails",
    serviceName: "Manicure gel",
    source: "plan",
    status: "done",
  },
  {
    id: "h4",
    customerId: "3",
    date: "05 Nov 2025",
    time: "19:00",
    professionalName: "Rafa Barber",
    serviceName: "Corte masculino",
    source: "walk_in",
    status: "done",
  },
];

export default function OwnerClientesPage() {
  const selectedId = "1"; // depois vira estado / rota
  const selectedCustomer = customers.find((c) => c.id === selectedId);
  const selectedPlan = customerPlans.find((p) => p.customerId === selectedId);
  const selectedHistory = appointmentHistory.filter(
    (h) => h.customerId === selectedId
  );

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

          <div className="space-y-2 text-xs">
            {customers.map((customer) => {
              const isSelected = customer.id === selectedId;

              return (
                <button
                  key={customer.id}
                  className={[
                    "w-full text-left rounded-xl border px-3 py-2 transition-colors",
                    isSelected
                      ? "border-emerald-500/60 bg-emerald-500/5"
                      : "border-slate-800 bg-slate-950/60 hover:border-slate-700",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-[13px]">{customer.name}</p>
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
                Ainda não há visitas registadas para este cliente.
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
  source: CustomerAppointmentHistory["source"];
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
  status: CustomerAppointmentHistory["status"];
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
