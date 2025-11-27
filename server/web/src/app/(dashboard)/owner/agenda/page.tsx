// src/app/(dashboard)/owner/agenda/page.tsx

type AgendaProfessional = {
  id: string;
  name: string;
};

type AgendaAppointment = {
  id: string;
  professionalId: string;
  time: string; // "09:00"
  customerName: string;
  serviceName: string;
  status: "scheduled" | "in_service" | "done" | "no_show" | "cancelled";
};

const professionals: AgendaProfessional[] = [
  { id: "rafa", name: "Rafa Barber" },
  { id: "joao", name: "João Fade" },
  { id: "ana", name: "Ana Nails" },
];

const appointments: AgendaAppointment[] = [
  {
    id: "1",
    professionalId: "rafa",
    time: "09:00",
    customerName: "Miguel",
    serviceName: "Corte + Barba",
    status: "scheduled",
  },
  {
    id: "2",
    professionalId: "joao",
    time: "09:30",
    customerName: "Carlos",
    serviceName: "Corte masculino",
    status: "in_service",
  },
  {
    id: "3",
    professionalId: "ana",
    time: "10:00",
    customerName: "Bianca",
    serviceName: "Manicure gel",
    status: "scheduled",
  },
];

const timeSlots = [
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
];

export default function OwnerAgendaPage() {
  return (
    <>
      {/* Cabeçalho da página */}
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Agenda</h1>
          <p className="text-xs text-slate-400">
            Visão diária por profissional. Depois vamos ligar filtros reais de
            unidade e data.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900/80">
            Hoje · Terça-feira
          </button>
          <select className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200">
            <option>Unidade Demo Barber – Centro</option>
          </select>
          <select className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200">
            <option>Todos os profissionais</option>
            {professionals.map((pro) => (
              <option key={pro.id}>{pro.name}</option>
            ))}
          </select>
          <div className="flex rounded-lg border border-slate-800 bg-slate-900/80 overflow-hidden">
            <button className="px-3 py-1 text-slate-50 bg-slate-800 text-[11px]">
              Diário
            </button>
            <button className="px-3 py-1 text-slate-400 text-[11px]">
              Semanal
            </button>
          </div>
        </div>
      </header>

      {/* Grid da agenda diária */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="grid grid-cols-[80px_repeat(3,minmax(0,1fr))] gap-2 text-xs">
          {/* Cabeçalho de colunas */}
          <div />
          {professionals.map((pro) => (
            <div
              key={pro.id}
              className="px-2 py-1 rounded-lg bg-slate-950/50 border border-slate-800/80 font-medium"
            >
              {pro.name}
            </div>
          ))}

          {/* Linhas de horários */}
          {timeSlots.map((slot) => (
            <RowTimeSlot
              key={slot}
              slot={slot}
              professionals={professionals}
              appointments={appointments}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function RowTimeSlot({
  slot,
  professionals,
  appointments,
}: {
  slot: string;
  professionals: AgendaProfessional[];
  appointments: AgendaAppointment[];
}) {
  return (
    <>
      {/* Coluna de horário */}
      <div className="flex items-start justify-end pr-1 pt-2 text-[10px] text-slate-500">
        {slot}
      </div>

      {/* Colunas por profissional */}
      {professionals.map((pro) => {
        const appt = appointments.find(
          (a) => a.professionalId === pro.id && a.time === slot
        );

        if (!appt) {
          return (
            <div
              key={pro.id}
              className="h-14 rounded-xl border border-slate-800/50 bg-slate-950/30"
            />
          );
        }

        const statusStyles = getStatusClasses(appt.status);

        return (
          <div
            key={pro.id}
            className={`h-14 rounded-xl border px-2 py-1 flex flex-col justify-between ${statusStyles.container}`}
          >
            <p className="text-[11px] font-medium">{appt.serviceName}</p>
            <p className="text-[10px] text-slate-300">{appt.customerName}</p>
            <span
              className={`self-start text-[9px] px-1 rounded ${statusStyles.badge}`}
            >
              {statusStyles.label}
            </span>
          </div>
        );
      })}
    </>
  );
}

function getStatusClasses(status: AgendaAppointment["status"]) {
  switch (status) {
    case "in_service":
      return {
        label: "Em atendimento",
        container: "border-emerald-500/40 bg-emerald-500/10",
        badge: "bg-emerald-500/30 text-emerald-100",
      };
    case "done":
      return {
        label: "Concluído",
        container: "border-slate-700 bg-slate-900",
        badge: "bg-slate-700 text-slate-100",
      };
    case "no_show":
      return {
        label: "Falta",
        container: "border-amber-500/40 bg-amber-500/10",
        badge: "bg-amber-500/30 text-amber-100",
      };
    case "cancelled":
      return {
        label: "Cancelado",
        container: "border-rose-500/40 bg-rose-500/10",
        badge: "bg-rose-500/30 text-rose-100",
      };
    default:
      return {
        label: "Agendado",
        container: "border-sky-500/40 bg-sky-500/10",
        badge: "bg-sky-500/30 text-sky-100",
      };
  }
}
