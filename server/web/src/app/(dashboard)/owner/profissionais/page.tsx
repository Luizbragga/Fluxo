// src/app/(dashboard)/owner/profissionais/page.tsx

type Professional = {
  id: string;
  name: string;
  specialty: string;
  locationName: string;
  isActive: boolean;
  averageOccupation: number; // 0–100
};

type ProfessionalSummary = {
  id: string;
  totalAppointmentsMonth: number;
  totalRevenueMonth: number;
  professionalShareMonth: number;
  spaceShareMonth: number;
};

type ProfessionalPayoutSummary = {
  id: string;
  periodLabel: string;
  amount: number;
  status: "pending" | "paid";
};

const professionals: Professional[] = [
  {
    id: "rafa",
    name: "Rafa Barber",
    specialty: "Cortes & barbas",
    locationName: "Demo Barber – Centro",
    isActive: true,
    averageOccupation: 82,
  },
  {
    id: "joao",
    name: "João Fade",
    specialty: "Fades & design",
    locationName: "Demo Barber – Centro",
    isActive: true,
    averageOccupation: 68,
  },
  {
    id: "ana",
    name: "Ana Nails",
    specialty: "Nail designer",
    locationName: "Demo Nails – Anexo",
    isActive: false,
    averageOccupation: 54,
  },
];

const professionalSummaries: ProfessionalSummary[] = [
  {
    id: "rafa",
    totalAppointmentsMonth: 86,
    totalRevenueMonth: 2150,
    professionalShareMonth: 1290,
    spaceShareMonth: 860,
  },
  {
    id: "joao",
    totalAppointmentsMonth: 63,
    totalRevenueMonth: 1590,
    professionalShareMonth: 954,
    spaceShareMonth: 636,
  },
  {
    id: "ana",
    totalAppointmentsMonth: 41,
    totalRevenueMonth: 980,
    professionalShareMonth: 588,
    spaceShareMonth: 392,
  },
];

const payoutSummaries: ProfessionalPayoutSummary[] = [
  {
    id: "1",
    periodLabel: "Período 18–24 Nov · 12 atendimentos",
    amount: 210,
    status: "pending",
  },
  {
    id: "2",
    periodLabel: "Período 11–17 Nov · pago",
    amount: 180,
    status: "paid",
  },
];

export default function OwnerProfessionalsPage() {
  const selectedId = "rafa"; // depois isso vira estado / rota

  const selectedProfessional = professionals.find((p) => p.id === selectedId);
  const selectedSummary = professionalSummaries.find(
    (s) => s.id === selectedId
  );

  return (
    <>
      {/* Cabeçalho */}
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Profissionais</h1>
          <p className="text-xs text-slate-400">
            Gestão da equipa, ocupação, comissões e repasses.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <select className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200">
            <option>Unidade Demo Barber – Centro</option>
          </select>
          <button className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200">
            + Adicionar profissional
          </button>
        </div>
      </header>

      {/* Grid principal: lista + detalhes */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lista de profissionais */}
        <div className="lg:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3 text-xs">
            <p className="text-slate-400">Lista de profissionais</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ver todos os estados
            </button>
          </div>

          <div className="mb-3">
            <input
              placeholder="Buscar por nome ou especialidade..."
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-2 text-xs">
            {professionals.map((pro) => {
              const isSelected = pro.id === selectedId;

              return (
                <button
                  key={pro.id}
                  className={[
                    "w-full text-left rounded-xl border px-3 py-2 transition-colors",
                    isSelected
                      ? "border-emerald-500/60 bg-emerald-500/5"
                      : "border-slate-800 bg-slate-950/60 hover:border-slate-700",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[13px]">{pro.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {pro.specialty}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {pro.locationName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-slate-400">Ocupação</p>
                      <p className="text-sm font-semibold">
                        {pro.averageOccupation}%
                      </p>
                      <span
                        className={[
                          "inline-flex mt-1 rounded-full px-2 py-[1px] text-[9px]",
                          pro.isActive
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-slate-700 text-slate-200",
                        ].join(" ")}
                      >
                        {pro.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detalhes do profissional selecionado */}
        <div className="lg:col-span-2 space-y-4">
          {/* Resumo superior */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            {selectedProfessional && selectedSummary ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-slate-400">Profissional</p>
                    <p className="text-sm font-semibold">
                      {selectedProfessional.name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {selectedProfessional.specialty} ·{" "}
                      {selectedProfessional.locationName}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-slate-400">Ocupação média</p>
                    <p className="text-lg font-semibold">
                      {selectedProfessional.averageOccupation}%
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Atendimentos (mês)
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {selectedSummary.totalAppointmentsMonth}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Receita total (mês)
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      € {selectedSummary.totalRevenueMonth}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Parte do profissional
                    </p>
                    <p className="mt-1 text-lg font-semibold text-emerald-300">
                      € {selectedSummary.professionalShareMonth}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Parte do espaço
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      € {selectedSummary.spaceShareMonth}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">
                Selecione um profissional na lista ao lado para ver o resumo.
              </p>
            )}
          </div>

          {/* Repasses / comissão */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400">Repasses recentes</p>
                <button className="text-[11px] text-emerald-400 hover:underline">
                  Ver todos
                </button>
              </div>
              <div className="space-y-2">
                {payoutSummaries.map((payout) => (
                  <div
                    key={payout.id}
                    className={[
                      "rounded-xl border px-3 py-2 flex items-center justify-between",
                      payout.status === "pending"
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-slate-800 bg-slate-950/60 opacity-70",
                    ].join(" ")}
                  >
                    <div>
                      <p className="text-[11px] text-slate-300">
                        {payout.periodLabel}
                      </p>
                      <p className="text-sm font-semibold">€ {payout.amount}</p>
                    </div>
                    <span
                      className={[
                        "text-[10px] px-2 py-[1px] rounded-full",
                        payout.status === "pending"
                          ? "bg-amber-500/30 text-amber-100"
                          : "bg-emerald-500/20 text-emerald-100",
                      ].join(" ")}
                    >
                      {payout.status === "pending" ? "Pendente" : "Pago"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400">Regras de comissão</p>
                <button className="text-[11px] text-emerald-400 hover:underline">
                  Gerir comissão
                </button>
              </div>
              <div className="space-y-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <p className="text-[11px] text-slate-300">Corte masculino</p>
                  <p className="text-[11px] text-slate-400">
                    50% do valor do serviço para o profissional
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <p className="text-[11px] text-slate-300">
                    Serviços de plano
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Comissão fixa por visita ou percentagem do plano
                  </p>
                </div>
                <div className="rounded-xl border border-dashed border-slate-700/80 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-500">
                  Depois vamos puxar essas regras de{" "}
                  <span className="font-mono text-[10px]">
                    ProviderCommission
                  </span>{" "}
                  e permitir edição visual aqui.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
