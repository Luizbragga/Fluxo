// src/app/(dashboard)/owner/relatorios/page.tsx

type OccupancyRow = {
  professionalName: string;
  averageOccupationPercent: number;
  peakWeekday: string;
  peakHourRange: string;
};

type CancellationRow = {
  id: string;
  date: string;
  time: string;
  customerName: string;
  professionalName: string;
  serviceName: string;
  type: "cancelled" | "no_show";
  reason?: string;
};

type MonthlyFinancialRow = {
  monthLabel: string;
  totalRevenue: number;
  spaceShare: number;
  professionalsShare: number;
  estimatedLossNoShow: number;
};

const occupancyData: OccupancyRow[] = [
  {
    professionalName: "Rafa Barber",
    averageOccupationPercent: 82,
    peakWeekday: "Sábado",
    peakHourRange: "10h–14h",
  },
  {
    professionalName: "João Fade",
    averageOccupationPercent: 68,
    peakWeekday: "Sexta-feira",
    peakHourRange: "16h–20h",
  },
  {
    professionalName: "Ana Nails",
    averageOccupationPercent: 54,
    peakWeekday: "Quinta-feira",
    peakHourRange: "14h–18h",
  },
];

const cancellationsData: CancellationRow[] = [
  {
    id: "c1",
    date: "18 Nov 2025",
    time: "19:00",
    customerName: "Carlos Andrade",
    professionalName: "Rafa Barber",
    serviceName: "Corte + Barba",
    type: "no_show",
    reason: "Cliente não apareceu",
  },
  {
    id: "c2",
    date: "16 Nov 2025",
    time: "15:30",
    customerName: "Miguel Silva",
    professionalName: "João Fade",
    serviceName: "Corte masculino",
    type: "cancelled",
    reason: "Cancelou 2h antes",
  },
  {
    id: "c3",
    date: "12 Nov 2025",
    time: "11:00",
    customerName: "Bianca Costa",
    professionalName: "Ana Nails",
    serviceName: "Manicure gel",
    type: "no_show",
    reason: "Sem contacto",
  },
];

const monthlyFinancialData: MonthlyFinancialRow[] = [
  {
    monthLabel: "Nov 2025",
    totalRevenue: 2740,
    spaceShare: 1588,
    professionalsShare: 1152,
    estimatedLossNoShow: 130,
  },
  {
    monthLabel: "Out 2025",
    totalRevenue: 2510,
    spaceShare: 1440,
    professionalsShare: 1070,
    estimatedLossNoShow: 95,
  },
  {
    monthLabel: "Set 2025",
    totalRevenue: 2390,
    spaceShare: 1375,
    professionalsShare: 1015,
    estimatedLossNoShow: 80,
  },
];

export default function OwnerRelatoriosPage() {
  return (
    <>
      {/* Cabeçalho */}
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Relatórios</h1>
          <p className="text-xs text-slate-400">
            Ocupação, cancelamentos, no-shows e visão financeira mensal.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <select className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200">
            <option>Unidade Demo Barber – Centro</option>
          </select>
          <select className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200">
            <option>Últimos 30 dias</option>
            <option>Últimos 90 dias</option>
            <option>Últimos 12 meses</option>
          </select>
          <button className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80">
            Exportar CSV
          </button>
        </div>
      </header>

      {/* Ocupação + Finanças mensais */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Ocupação por profissional */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Ocupação por profissional</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ver detalhes
            </button>
          </div>

          <div className="space-y-2">
            {occupancyData.map((row) => (
              <div
                key={row.professionalName}
                className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 flex items-center justify-between gap-3"
              >
                <div className="flex-1">
                  <p className="text-[11px] font-medium">
                    {row.professionalName}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Pico: {row.peakWeekday} · {row.peakHourRange}
                  </p>
                  <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500/70"
                      style={{ width: `${row.averageOccupationPercent}%` }}
                    />
                  </div>
                </div>
                <div className="w-16 text-right">
                  <p className="text-[10px] text-slate-400">Ocupação</p>
                  <p className="text-sm font-semibold">
                    {row.averageOccupationPercent}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Relatório financeiro mensal */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Relatório financeiro mensal</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Abrir em financeiro
            </button>
          </div>

          <div className="overflow-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-slate-400">
                  <th className="text-left py-2 pr-3 border-b border-slate-800">
                    Mês
                  </th>
                  <th className="text-right py-2 px-3 border-b border-slate-800">
                    Faturamento
                  </th>
                  <th className="text-right py-2 px-3 border-b border-slate-800">
                    Espaço
                  </th>
                  <th className="text-right py-2 px-3 border-b border-slate-800">
                    Profissionais
                  </th>
                  <th className="text-right py-2 pl-3 border-b border-slate-800">
                    Perda c/ no-shows
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthlyFinancialData.map((row) => (
                  <tr key={row.monthLabel} className="hover:bg-slate-950/50">
                    <td className="py-2 pr-3 text-slate-200">
                      {row.monthLabel}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-200">
                      € {row.totalRevenue}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-200">
                      € {row.spaceShare}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-200">
                      € {row.professionalsShare}
                    </td>
                    <td className="py-2 pl-3 text-right text-amber-300">
                      € {row.estimatedLossNoShow}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-[10px] text-slate-500">
            Depois vamos puxar esses valores de consultas agregadas no backend
            (faturamento total, comissões, perdas estimadas).
          </p>
        </div>
      </section>

      {/* Cancelamentos e no-shows */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
        <div className="flex items-center justify-between mb-3">
          <p className="text-slate-400">Cancelamentos e no-shows</p>
          <div className="flex gap-2">
            <button className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-950/80">
              Todos
            </button>
            <button className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-950/80">
              No-show
            </button>
            <button className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-950/80">
              Cancelado
            </button>
          </div>
        </div>

        <div className="overflow-auto max-h-80 pr-1">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="text-slate-400">
                <th className="text-left py-2 pr-3 border-b border-slate-800">
                  Data
                </th>
                <th className="text-left py-2 pr-3 border-b border-slate-800">
                  Cliente
                </th>
                <th className="text-left py-2 pr-3 border-b border-slate-800">
                  Profissional
                </th>
                <th className="text-left py-2 pr-3 border-b border-slate-800">
                  Serviço
                </th>
                <th className="text-left py-2 pr-3 border-b border-slate-800">
                  Tipo
                </th>
                <th className="text-left py-2 pl-3 border-b border-slate-800">
                  Motivo
                </th>
              </tr>
            </thead>
            <tbody>
              {cancellationsData.map((row) => (
                <tr key={row.id} className="hover:bg-slate-950/50">
                  <td className="py-2 pr-3 text-slate-200">
                    {row.date} · {row.time}
                  </td>
                  <td className="py-2 pr-3 text-slate-200">
                    {row.customerName}
                  </td>
                  <td className="py-2 pr-3 text-slate-200">
                    {row.professionalName}
                  </td>
                  <td className="py-2 pr-3 text-slate-200">
                    {row.serviceName}
                  </td>
                  <td className="py-2 pr-3">
                    <CancellationTypeBadge type={row.type} />
                  </td>
                  <td className="py-2 pl-3 text-slate-400">
                    {row.reason ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function CancellationTypeBadge({ type }: { type: CancellationRow["type"] }) {
  const base = "inline-block px-2 py-[1px] rounded-full text-[9px]";
  if (type === "no_show") {
    return (
      <span className={`${base} bg-rose-500/20 text-rose-100`}>No-show</span>
    );
  }
  return (
    <span className={`${base} bg-amber-500/20 text-amber-100`}>Cancelado</span>
  );
}
