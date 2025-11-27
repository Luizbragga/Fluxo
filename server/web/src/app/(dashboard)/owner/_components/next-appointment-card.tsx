// src/app/(dashboard)/owner/_components/next-appointment-card.tsx

export type NextAppointment = {
  id: string;
  time: string;
  title: string;
  detail: string;
  source: "plan" | "walk_in" | "app";
};

export function NextAppointmentCard({
  appointment,
}: {
  appointment: NextAppointment;
}) {
  const badgeConfig: Record<
    NextAppointment["source"],
    { label: string; className: string }
  > = {
    plan: {
      label: "Plano",
      className: "bg-emerald-500/15 text-emerald-300",
    },
    walk_in: {
      label: "Avulso",
      className: "bg-slate-800 text-slate-200",
    },
    app: {
      label: "App",
      className: "bg-slate-800 text-slate-200",
    },
  };

  const cfg = badgeConfig[appointment.source];

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2">
      <div>
        <p className="font-medium">
          {appointment.time} · {appointment.title}
        </p>
        <p className="text-[11px] text-slate-400">{appointment.detail}</p>
      </div>
      <span
        className={`text-[11px] rounded-full px-2 py-[2px] ${cfg.className}`}
      >
        {cfg.label}
      </span>
    </div>
  );
}
