// src/app/(dashboard)/owner/servicos/page.tsx

type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  basePrice: number;
  isActive: boolean;
  isPlanEligible: boolean;
  category: string;
};

type ServiceStats = {
  serviceId: string;
  timesBookedMonth: number;
  revenueMonth: number;
  averageTicketWhenUsed: number;
};

const services: Service[] = [
  {
    id: "corte_masculino",
    name: "Corte masculino",
    durationMinutes: 30,
    basePrice: 15,
    isActive: true,
    isPlanEligible: true,
    category: "Cabelo",
  },
  {
    id: "corte_barba",
    name: "Corte + Barba",
    durationMinutes: 45,
    basePrice: 22,
    isActive: true,
    isPlanEligible: true,
    category: "Cabelo & barba",
  },
  {
    id: "barba_express",
    name: "Barba express",
    durationMinutes: 20,
    basePrice: 12,
    isActive: true,
    isPlanEligible: false,
    category: "Barba",
  },
  {
    id: "manicure_gel",
    name: "Manicure gel",
    durationMinutes: 50,
    basePrice: 28,
    isActive: false,
    isPlanEligible: true,
    category: "Nails",
  },
];

const serviceStats: ServiceStats[] = [
  {
    serviceId: "corte_masculino",
    timesBookedMonth: 72,
    revenueMonth: 1080,
    averageTicketWhenUsed: 21,
  },
  {
    serviceId: "corte_barba",
    timesBookedMonth: 43,
    revenueMonth: 946,
    averageTicketWhenUsed: 26,
  },
  {
    serviceId: "barba_express",
    timesBookedMonth: 18,
    revenueMonth: 216,
    averageTicketWhenUsed: 17,
  },
  {
    serviceId: "manicure_gel",
    timesBookedMonth: 9,
    revenueMonth: 252,
    averageTicketWhenUsed: 32,
  },
];

export default function OwnerServicosPage() {
  const selectedId = "corte_masculino"; // depois vira estado / rota

  const selectedService = services.find((s) => s.id === selectedId);
  const selectedStats = serviceStats.find((st) => st.serviceId === selectedId);

  return (
    <>
      {/* Cabeçalho */}
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Serviços</h1>
          <p className="text-xs text-slate-400">
            Catálogo de serviços, duração, preços e elegibilidade para planos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <select className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200">
            <option>Todas as categorias</option>
            <option>Cabelo</option>
            <option>Barba</option>
            <option>Nails</option>
          </select>
          <button className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200">
            + Adicionar serviço
          </button>
        </div>
      </header>

      {/* Grid principal: lista + detalhes */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lista de serviços */}
        <div className="lg:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3 text-xs">
            <p className="text-slate-400">Lista de serviços</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ordenar
            </button>
          </div>

          <div className="mb-3">
            <input
              placeholder="Buscar por nome ou categoria..."
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-2 text-xs">
            {services.map((service) => {
              const isSelected = service.id === selectedId;
              const stats = serviceStats.find(
                (st) => st.serviceId === service.id
              );

              return (
                <button
                  key={service.id}
                  className={[
                    "w-full text-left rounded-xl border px-3 py-2 transition-colors",
                    isSelected
                      ? "border-emerald-500/60 bg-emerald-500/5"
                      : "border-slate-800 bg-slate-950/60 hover:border-slate-700",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-[13px]">{service.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {service.category} · {service.durationMinutes} min
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Base: € {service.basePrice}
                      </p>
                    </div>
                    <div className="text-right">
                      {stats && (
                        <>
                          <p className="text-[11px] text-slate-400">
                            Usos (mês)
                          </p>
                          <p className="text-sm font-semibold">
                            {stats.timesBookedMonth}
                          </p>
                        </>
                      )}
                      <span
                        className={[
                          "inline-flex mt-1 rounded-full px-2 py-[1px] text-[9px]",
                          service.isActive
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-slate-700 text-slate-200",
                        ].join(" ")}
                      >
                        {service.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detalhes do serviço selecionado */}
        <div className="lg:col-span-2 space-y-4">
          {/* Bloco principal de detalhes */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
            {selectedService ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-slate-400 text-[11px]">
                      Serviço selecionado
                    </p>
                    <p className="text-sm font-semibold">
                      {selectedService.name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {selectedService.category}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-400">Duração padrão</p>
                    <p className="text-lg font-semibold">
                      {selectedService.durationMinutes} min
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Preço base: € {selectedService.basePrice}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">Estado</p>
                    <p className="mt-1 text-sm font-semibold">
                      {selectedService.isActive ? "Ativo" : "Inativo"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Depois vamos permitir ativar/desativar aqui.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Elegível para planos?
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {selectedService.isPlanEligible ? "Sim" : "Não"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Ligação direta com{" "}
                      <span className="font-mono text-[10px]">
                        PlanTemplate
                      </span>{" "}
                      no backend.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Integração com comissão
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      ProviderCommission
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      No futuro, vamos conectar este serviço às regras de
                      comissão por profissional.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">
                Selecione um serviço na lista ao lado para ver detalhes.
              </p>
            )}
          </div>

          {/* Estatísticas do serviço */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-400">Estatísticas do serviço</p>
              <button className="text-[11px] text-emerald-400 hover:underline">
                Ver no relatório
              </button>
            </div>

            {selectedStats ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[11px] text-slate-400">
                    Atendimentos no mês
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {selectedStats.timesBookedMonth}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[11px] text-slate-400">
                    Receita gerada (mês)
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    € {selectedStats.revenueMonth}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[11px] text-slate-400">
                    Ticket médio com este serviço
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    € {selectedStats.averageTicketWhenUsed}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">
                Ainda não há dados suficientes para este serviço.
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
