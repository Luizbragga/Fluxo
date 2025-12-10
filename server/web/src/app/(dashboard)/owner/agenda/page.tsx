"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useRequireAuth } from "@/lib/use-auth";
import { restoreOwnerPlanVisitFromAppointment } from "../_api/owner-plans";
import {
  fetchOwnerAgendaDay,
  updateAppointmentStatus,
  type AgendaProfessional,
  type AgendaAppointment,
} from "../_api/owner-agenda";
import {
  createOwnerAppointment,
  type CreateAppointmentInput,
  fetchOwnerServicesForAppointment,
  type OwnerServiceForAppointment,
} from "../_api/owner-appointments";

type PendingAppointmentSlot = {
  time: string;
  professionalId: string;
  professionalName: string;
};

type FilterProfessionalId = string | "all";

const timeSlots = [
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
  "19:00",
  "19:30",
  "20:00",
  "20:30",
];

export default function OwnerAgendaPage() {
  // Protege a rota: só owner logado entra
  const { user, loading: authLoading } = useRequireAuth({
    requiredRole: "owner",
  });

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [professionals, setProfessionals] = useState<AgendaProfessional[]>([]);
  const [appointments, setAppointments] = useState<AgendaAppointment[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] =
    useState<FilterProfessionalId>("all");
  const [loadingAgenda, setLoadingAgenda] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [restoredPlanVisits, setRestoredPlanVisits] = useState<string[]>([]);
  // RESUMO DO DIA (contagens simples)
  const agendaStats = useMemo(() => {
    const total = appointments.length;

    let planCount = 0;
    let avulsoCount = 0;

    let scheduled = 0;
    let inService = 0;
    let done = 0;
    let noShow = 0;
    let cancelled = 0;

    for (const appt of appointments) {
      if (appt.billingType === "plan") {
        planCount++;
      } else {
        avulsoCount++;
      }

      switch (appt.status) {
        case "scheduled":
          scheduled++;
          break;
        case "in_service":
          inService++;
          break;
        case "done":
          done++;
          break;
        case "no_show":
          noShow++;
          break;
        case "cancelled":
          cancelled++;
          break;
      }
    }

    return {
      total,
      planCount,
      avulsoCount,
      scheduled,
      inService,
      done,
      noShow,
      cancelled,
    };
  }, [appointments]);
  // Slot clicado para criar agendamento
  const [pendingSlot, setPendingSlot] = useState<PendingAppointmentSlot | null>(
    null
  );
  const [modalCustomerName, setModalCustomerName] = useState("");
  const [modalCustomerPhone, setModalCustomerPhone] = useState("");

  const searchParams = useSearchParams();
  const customerNameFromUrl = searchParams.get("customerName");
  const customerPhoneFromUrl = searchParams.get("customerPhone");
  const customerPlanIdFromUrl = searchParams.get("customerPlanId");

  // NOVO: lista de serviços permitidos pelo plano (ids separados por vírgula)
  const planServiceIdsParam = searchParams.get("planServiceIds");
  const planServiceIds = useMemo(
    () =>
      planServiceIdsParam
        ? planServiceIdsParam
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : null,
    [planServiceIdsParam]
  );

  const hasCustomerPrefill = !!customerNameFromUrl || !!customerPhoneFromUrl;

  // Se veio um customerPlanId na URL, por padrão marcamos "usar plano"
  const [usePlanForAppointment, setUsePlanForAppointment] = useState<boolean>(
    !!customerPlanIdFromUrl
  );

  const [services, setServices] = useState<OwnerServiceForAppointment[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [modalProviderId, setModalProviderId] = useState<string>("");

  useEffect(() => {
    async function loadAgenda() {
      if (authLoading) return;
      if (!user) return; // o hook já redireciona se não tiver user

      try {
        setLoadingAgenda(true);
        setError(null);

        const dateStr = formatDateYYYYMMDD(selectedDate);
        const data = await fetchOwnerAgendaDay(dateStr);

        setProfessionals(data.professionals);
        setAppointments(data.appointments);
        setRestoredPlanVisits([]);
      } catch (err) {
        console.error("Erro ao carregar agenda do owner:", err);
        setError("Erro ao carregar a agenda do dia.");
      } finally {
        setLoadingAgenda(false);
      }
    }

    loadAgenda();
  }, [authLoading, user, selectedDate]);

  useEffect(() => {
    if (customerNameFromUrl) {
      setModalCustomerName(customerNameFromUrl);
    }
    if (customerPhoneFromUrl) {
      setModalCustomerPhone(customerPhoneFromUrl);
    }
  }, [customerNameFromUrl, customerPhoneFromUrl]);

  useEffect(() => {
    let isMounted = true;

    async function loadServices() {
      try {
        setServicesLoading(true);

        const items = await fetchOwnerServicesForAppointment(
          usePlanForAppointment && customerPlanIdFromUrl
            ? customerPlanIdFromUrl
            : undefined
        );

        if (!isMounted) return;

        setServices(items);

        if (items.length > 0) {
          setSelectedServiceId(items[0].id);
        } else {
          setSelectedServiceId("");
        }
      } catch (err) {
        console.error("Erro ao carregar serviços:", err);
        // no futuro podemos exibir erro na UI
      } finally {
        if (isMounted) {
          setServicesLoading(false);
        }
      }
    }

    loadServices();

    return () => {
      isMounted = false;
    };
  }, [usePlanForAppointment, customerPlanIdFromUrl]);

  // NOVO: serviços que serão exibidos no select,
  // dependendo se está usando plano ou não
  const displayedServices = useMemo(() => {
    // se não estiver usando plano, mostra todos
    if (!usePlanForAppointment) {
      return services;
    }

    // se não tiver lista de serviços do plano, mostra todos (fallback seguro)
    if (!planServiceIds || planServiceIds.length === 0) {
      return services;
    }

    // usando plano: só serviços cujos IDs estão na lista do plano
    return services.filter((service) => planServiceIds.includes(service.id));
  }, [services, usePlanForAppointment, planServiceIds]);

  // NOVO: garante que, ao usar plano, o serviço selecionado
  // sempre seja um dos permitidos pelo plano
  useEffect(() => {
    if (!usePlanForAppointment) return;
    if (!planServiceIds || planServiceIds.length === 0) return;

    if (!selectedServiceId || !planServiceIds.includes(selectedServiceId)) {
      const firstAllowed = displayedServices[0];
      if (firstAllowed) {
        setSelectedServiceId(firstAllowed.id);
      }
    }
  }, [
    usePlanForAppointment,
    planServiceIds,
    selectedServiceId,
    displayedServices,
  ]);

  // Handler: mudança de status
  // - se NÃO passar forceStatus, segue o fluxo normal (scheduled -> in_service -> done)
  // - se passar forceStatus (no_show / cancelled), aplica diretamente esse status
  async function handleChangeStatus(
    appointmentId: string,
    currentStatus: AgendaAppointment["status"],
    forceStatus?: AgendaAppointment["status"]
  ) {
    const nextStatus = forceStatus ?? getNextStatusForClick(currentStatus);

    // nada a fazer (done / no_show / cancelled sem mudança)
    if (!nextStatus || nextStatus === currentStatus) {
      return;
    }

    try {
      setError(null);

      // otimista: atualiza na tela antes
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === appointmentId ? { ...a, status: nextStatus } : a
        )
      );

      await updateAppointmentStatus(appointmentId, nextStatus);
    } catch (err) {
      console.error("Erro ao atualizar status do agendamento:", err);
      setError("Não foi possível atualizar o status do agendamento.");

      // rollback
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === appointmentId ? { ...a, status: currentStatus } : a
        )
      );
    }
  }
  // Devolver 1 visita do plano (quando o owner decide perdoar a falta)
  async function handleRestorePlanVisit(appointmentId: string) {
    try {
      setError(null);

      // chama o backend para devolver 1 visita
      await restoreOwnerPlanVisitFromAppointment(appointmentId);

      // recarrega a agenda do dia para refletir a contagem correta
      const dateStr = formatDateYYYYMMDD(selectedDate);
      const data = await fetchOwnerAgendaDay(dateStr);

      setProfessionals(data.professionals);
      setAppointments(data.appointments);
      setRestoredPlanVisits((prev) =>
        prev.includes(appointmentId) ? prev : [...prev, appointmentId]
      );
    } catch (err) {
      console.error("Erro ao devolver visita do plano:", err);
      setError("Não foi possível devolver a visita do plano.");
    }
  }

  function handleCreateAppointmentClick(slot: PendingAppointmentSlot) {
    setCreateError(null);
    setPendingSlot(slot);
    setModalProviderId(slot.professionalId); // pré-seleciona o profissional da coluna clicada
  }

  function handleCloseCreateModal() {
    setCreateError(null);
    setPendingSlot(null);
    setModalProviderId("");
  }

  async function handleSaveCreateAppointment() {
    if (!pendingSlot) return;

    if (!modalCustomerName.trim() || !modalCustomerPhone.trim()) {
      setCreateError(
        "Nome e telefone do cliente são obrigatórios para criar o agendamento."
      );
      return;
    }

    if (!selectedServiceId) {
      setCreateError("Selecione um serviço para criar o agendamento.");
      return;
    }

    const selectedService = services.find(
      (service) => service.id === selectedServiceId
    );

    if (!selectedService) {
      setCreateError("Serviço selecionado inválido.");
      return;
    }
    if (!modalProviderId) {
      setCreateError("Selecione um profissional para criar o agendamento.");
      return;
    }

    try {
      setCreateError(null);
      setSavingAppointment(true);

      const [hoursStr, minutesStr] = pendingSlot.time.split(":");
      const hours = Number(hoursStr);
      const minutes = Number(minutesStr);

      const startDate = new Date(selectedDate);
      startDate.setHours(hours, minutes, 0, 0);

      const endDate = new Date(startDate);
      endDate.setMinutes(endDate.getMinutes() + selectedService.durationMin);

      const input: CreateAppointmentInput = {
        providerId: modalProviderId,
        serviceId: selectedService.id,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        clientName: modalCustomerName.trim(),
        clientPhone: modalCustomerPhone,
        // Se veio plano na URL e o utilizador escolheu usar plano,
        // enviamos o customerPlanId; caso contrário, vai como avulso
        ...(customerPlanIdFromUrl && usePlanForAppointment
          ? { customerPlanId: customerPlanIdFromUrl }
          : {}),
      };

      await createOwnerAppointment(input);

      // Recarrega a agenda do dia para mostrar o novo slot ocupado
      const dateStr = formatDateYYYYMMDD(selectedDate);
      const data = await fetchOwnerAgendaDay(dateStr);

      setProfessionals(data.professionals);
      setAppointments(data.appointments);

      // Fecha o modal
      setPendingSlot(null);
    } catch (err: any) {
      console.error("Erro ao criar agendamento:", err);

      const apiError = err?.data;

      // Normaliza a mensagem que veio do backend
      let backendMessage: string | undefined;

      if (typeof apiError?.message === "string") {
        backendMessage = apiError.message;
      } else if (Array.isArray(apiError?.message)) {
        backendMessage = apiError.message.join(" ");
      } else if (typeof err?.message === "string") {
        backendMessage = err.message;
      }

      const msg = backendMessage ?? "";

      if (apiError?.code === "CUSTOMER_NAME_CONFLICT") {
        setCreateError(
          apiError.message ??
            "Já existe um cliente com este telefone registado com outro nome."
        );
      }
      // Plano esgotado -> força atendimento avulso
      else if (
        msg.includes(
          "Cliente já utilizou todas as visitas disponíveis neste ciclo do plano"
        )
      ) {
        setUsePlanForAppointment(false);
        setCreateError(
          "Os atendimentos do plano deste cliente já foram todos usados neste ciclo. " +
            "Este agendamento será registado como atendimento avulso."
        );
      }
      // Data fora do ciclo -> também força avulso
      else if (
        msg.includes(
          "Data do agendamento está fora do ciclo atual do plano do cliente"
        )
      ) {
        setUsePlanForAppointment(false);
        setCreateError(
          "A data escolhida está fora do ciclo atual do plano deste cliente. " +
            "Este agendamento será registado como atendimento avulso."
        );
      }
      // Dia da semana não permitido pelo plano
      else if (
        msg.includes(
          "Este plano não permite agendamentos neste dia da semana"
        ) ||
        msg.includes("Este dia da semana não é permitido para este plano")
      ) {
        setCreateError(
          msg ||
            "Este plano não permite agendamentos neste dia da semana. Escolha um dia permitido pelo plano."
        );
      }
      // Horário não permitido pelo plano
      else if (
        msg.includes("Horário inicial não é permitido por este plano") ||
        msg.includes("Horário final não é permitido por este plano") ||
        msg.includes("Este plano só pode ser utilizado nos horários permitidos")
      ) {
        setCreateError(
          msg ||
            "Horário não permitido para este plano. Escolha um horário dentro da janela permitida."
        );
      }
      // Serviço fora do plano
      else if (
        msg.includes("Este serviço não faz parte do plano selecionado") ||
        msg.includes(
          "O serviço escolhido não faz parte dos serviços incluídos neste plano"
        )
      ) {
        setCreateError(
          msg ||
            "Este serviço não faz parte do plano selecionado. Altere o serviço ou marque como atendimento avulso."
        );
      }
      // Intervalo mínimo entre visitas
      else if (
        msg.includes("intervalo mínimo de") &&
        msg.includes("entre visitas")
      ) {
        setCreateError(msg);
      }
      // Antecedência mínima
      else if (
        msg.includes("exige agendamento com pelo menos") &&
        msg.includes("dia(s) de antecedência")
      ) {
        setCreateError(msg);
      }
      // Qualquer outro erro
      else {
        setCreateError(
          msg || "Não foi possível criar o agendamento. Tente novamente."
        );
      }
    } finally {
      setSavingAppointment(false);
    }
  }

  const visibleProfessionals =
    selectedProfessionalId === "all"
      ? professionals
      : professionals.filter((pro) => pro.id === selectedProfessionalId);
  const weekdayLabel = getWeekdayLabel(selectedDate);

  const today = new Date();
  const todayStr = formatDateYYYYMMDD(today);
  const selectedDateStr = formatDateYYYYMMDD(selectedDate);
  const maxDate = addDays(today, 30);
  const maxDateStr = formatDateYYYYMMDD(maxDate);

  const isToday = selectedDateStr === todayStr;

  // label bonitinho
  const dateLabel = isToday
    ? `Hoje · ${weekdayLabel}`
    : `${selectedDate.toLocaleDateString("pt-PT")} · ${weekdayLabel}`;

  if (authLoading || loadingAgenda) {
    return (
      <div className="text-sm text-slate-400">Carregando agenda do dia...</div>
    );
  }

  if (error) {
    return <div className="text-sm text-rose-400">{error}</div>;
  }

  if (!professionals.length) {
    return (
      <>
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-lg font-semibold">Agenda</h1>
            <p className="text-xs text-slate-400">
              Visão diária por profissional.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2">
              <button className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900/80">
                {dateLabel}
              </button>

              <input
                type="date"
                className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200 text-xs"
                value={selectedDateStr}
                min={todayStr}
                max={maxDateStr}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const [y, m, d] = e.target.value.split("-").map(Number);
                  setSelectedDate(new Date(y, m - 1, d, 0, 0, 0, 0));
                }}
              />
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400">
          Nenhum agendamento encontrado para hoje.
        </section>
      </>
    );
  }

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
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900/80">
              {dateLabel}
            </button>

            <input
              type="date"
              className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200 text-xs"
              value={selectedDateStr}
              min={todayStr}
              max={maxDateStr}
              onChange={(e) => {
                if (!e.target.value) return;
                const [y, m, d] = e.target.value.split("-").map(Number);
                setSelectedDate(new Date(y, m - 1, d, 0, 0, 0, 0));
              }}
            />
          </div>

          <select className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200">
            <option>Unidade atual do tenant</option>
          </select>
          <select
            className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200"
            value={selectedProfessionalId}
            onChange={(e) =>
              setSelectedProfessionalId(
                (e.target.value || "all") as FilterProfessionalId
              )
            }
          >
            <option value="all">Todos os profissionais</option>
            {professionals.map((pro) => (
              <option key={pro.id} value={pro.id}>
                {pro.name}
              </option>
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
      {/* Resumo rápido do dia */}
      <section className="mb-4 grid gap-2 text-xs md:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
          <p className="text-[11px] text-slate-400">Atendimentos do dia</p>
          <p className="text-lg font-semibold text-slate-50">
            {agendaStats.total}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-400">Plano</p>
            <p className="text-sm font-semibold text-emerald-300">
              {agendaStats.planCount}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">Avulso</p>
            <p className="text-sm font-semibold text-slate-100">
              {agendaStats.avulsoCount}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
          <p className="text-[11px] text-slate-400 mb-1">Status</p>
          <p className="text-[11px] text-slate-300">
            Agendados:{" "}
            <span className="text-slate-50">{agendaStats.scheduled}</span>
          </p>
          <p className="text-[11px] text-slate-300">
            Em atendimento:{" "}
            <span className="text-emerald-300">{agendaStats.inService}</span>
          </p>
          <p className="text-[11px] text-slate-300">
            Concluídos: <span className="text-sky-300">{agendaStats.done}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
          <p className="text-[11px] text-slate-400 mb-1">Ausências</p>
          <p className="text-[11px] text-slate-300">
            Faltas: <span className="text-amber-300">{agendaStats.noShow}</span>
          </p>
          <p className="text-[11px] text-slate-300">
            Cancelados:{" "}
            <span className="text-rose-300">{agendaStats.cancelled}</span>
          </p>
        </div>
      </section>

      {/* Banner de agendamento vindo da tela de cliente */}
      {hasCustomerPrefill && (
        <div className="mb-4 rounded-2xl border border-emerald-600/40 bg-emerald-500/5 px-4 py-3 text-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-emerald-300/80">
              Agendamento para cliente
            </p>
            <p className="text-sm font-semibold text-emerald-100">
              {customerNameFromUrl || "Cliente sem nome"}
            </p>
            {customerPhoneFromUrl && (
              <p className="text-[11px] text-emerald-200/80">
                {customerPhoneFromUrl}
              </p>
            )}
          </div>

          <button
            className="text-[11px] text-emerald-300 hover:underline"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.history.replaceState(null, "", "/owner/agenda");
              }
            }}
          >
            Limpar
          </button>
        </div>
      )}

      {/* Grid da agenda diária */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="grid grid-cols-[80px_repeat(3,minmax(0,1fr))] gap-2 text-xs">
          {/* Cabeçalho de colunas */}
          <div />
          {visibleProfessionals.map((pro) => (
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
              professionals={visibleProfessionals}
              appointments={appointments}
              onChangeStatus={handleChangeStatus}
              onCreateAppointment={handleCreateAppointmentClick}
              onRestorePlanVisit={handleRestorePlanVisit}
              restoredPlanVisits={restoredPlanVisits}
            />
          ))}
        </div>
      </section>

      {/* Modal simples para criar agendamento */}
      {pendingSlot && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs shadow-xl">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Criar agendamento
                </p>
                <p className="text-sm font-semibold text-slate-100">
                  {customerNameFromUrl || "Cliente sem nome"}
                </p>
                {customerPhoneFromUrl && (
                  <p className="text-[11px] text-slate-400">
                    {customerPhoneFromUrl}
                  </p>
                )}
              </div>
              <button
                className="text-[11px] text-slate-400 hover:text-slate-100"
                onClick={handleCloseCreateModal}
              >
                Fechar
              </button>
            </div>

            <div className="space-y-3 mb-3">
              <div>
                <p className="text-[11px] text-slate-400 mb-1">
                  Nome do cliente
                </p>
                <input
                  className="w-full rounded-md bg-slate-900/60 border border-slate-700 px-2 py-1 text-[12px] text-slate-100 outline-none focus:border-emerald-500"
                  value={modalCustomerName}
                  onChange={(e) => setModalCustomerName(e.target.value)}
                  placeholder="Nome do cliente"
                />
              </div>

              <div>
                <p className="text-[11px] text-slate-400 mb-1">Telefone</p>
                <input
                  className="w-full rounded-md bg-slate-900/60 border border-slate-700 px-2 py-1 text-[12px] text-slate-100 outline-none focus:border-emerald-500"
                  value={modalCustomerPhone}
                  onChange={(e) => setModalCustomerPhone(e.target.value)}
                  placeholder="+351 9xx xxx xxx"
                />
              </div>

              <div>
                <p className="text-[11px] text-slate-400 mb-1">Serviço</p>
                {servicesLoading ? (
                  <p className="text-[11px] text-slate-500">
                    Carregando serviços...
                  </p>
                ) : services.length === 0 ? (
                  <p className="text-[11px] text-rose-400">
                    Nenhum serviço cadastrado. Crie um serviço primeiro.
                  </p>
                ) : (
                  <select
                    className="w-full rounded-md bg-slate-900/60 border border-slate-700 px-2 py-1 text-[12px] text-slate-100 outline-none focus:border-emerald-500"
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                  >
                    {displayedServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} ({service.durationMin} min)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {customerPlanIdFromUrl && (
                <div>
                  <p className="text-[11px] text-slate-400 mb-1">
                    Tipo de atendimento
                  </p>

                  <div className="flex flex-col gap-1">
                    {/* Usar regras do plano normalmente */}
                    <label className="inline-flex items-center gap-2 text-[11px] text-slate-200">
                      <input
                        type="radio"
                        className="h-3 w-3"
                        checked={usePlanForAppointment}
                        onChange={() => setUsePlanForAppointment(true)}
                      />
                      <span>
                        Usar plano deste cliente{" "}
                        <span className="text-[10px] text-slate-400">
                          (conta visita e aplica regras de dia/horário)
                        </span>
                      </span>
                    </label>

                    {/* Exceção do plano = atendimento fora do plano */}
                    <label className="inline-flex items-center gap-2 text-[11px] text-amber-200">
                      <input
                        type="radio"
                        className="h-3 w-3"
                        checked={!usePlanForAppointment}
                        onChange={() => setUsePlanForAppointment(false)}
                      />
                      <span>
                        Abrir exceção (atendimento avulso){" "}
                        <span className="text-[10px] text-amber-300/80">
                          não usa visitas do plano nem regras de dia/horário
                        </span>
                      </span>
                    </label>
                  </div>

                  <p className="mt-1 text-[10px] text-slate-500">
                    Dica: se o plano bloquear o dia, horário ou serviço e você
                    realmente quiser encaixar o cliente assim mesmo, marque{" "}
                    <span className="text-amber-300/90">
                      “Abrir exceção (atendimento avulso)”
                    </span>
                    .
                  </p>
                </div>
              )}

              <div>
                <p className="text-[11px] text-slate-400 mb-1">Profissional</p>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1 text-sm text-slate-100"
                  value={modalProviderId}
                  onChange={(e) => setModalProviderId(e.target.value)}
                >
                  {professionals.map((pro) => (
                    <option key={pro.id} value={pro.id}>
                      {pro.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-[11px] text-slate-400">Data</p>
                <p className="text-sm text-slate-100">{dateLabel}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Horário</p>
                <p className="text-sm text-slate-100">{pendingSlot.time}</p>
              </div>
            </div>

            {createError && (
              <p className="mt-2 text-[11px] text-rose-400">{createError}</p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[11px]"
                onClick={handleCloseCreateModal}
              >
                Cancelar
              </button>
              <button
                className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-[11px] text-emerald-100 disabled:opacity-60"
                type="button"
                onClick={handleSaveCreateAppointment}
                disabled={savingAppointment}
              >
                {savingAppointment ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RowTimeSlot({
  slot,
  professionals,
  appointments,
  onChangeStatus,
  onCreateAppointment,
  onRestorePlanVisit,
  restoredPlanVisits,
}: {
  slot: string;
  professionals: AgendaProfessional[];
  appointments: AgendaAppointment[];
  onChangeStatus?: (
    appointmentId: string,
    currentStatus: AgendaAppointment["status"],
    forceStatus?: AgendaAppointment["status"]
  ) => void;
  onCreateAppointment?: (params: {
    time: string;
    professionalId: string;
    professionalName: string;
  }) => void;
  onRestorePlanVisit?: (appointmentId: string) => void;
  restoredPlanVisits: string[];
}) {
  const slotStartMinutes = timeStrToMinutes(slot);
  const slotEndMinutes = slotStartMinutes + 30; // cada slot = 30min

  return (
    <>
      {/* Coluna de horário */}
      <div className="flex items-start justify-end pr-1 pt-2 text-[10px] text-slate-500">
        {slot}
      </div>

      {/* Colunas por profissional */}
      {professionals.map((pro) => {
        // procura algum agendamento que ocupe este slot
        const appt = appointments
          .filter((a) => a.professionalId === pro.id)
          .find((a) => {
            const startMin = timeStrToMinutes(a.time);
            const durationMin = ((a as any).serviceDurationMin ??
              (a as any).durationMin ??
              30) as number;

            // arredonda pra cima em blocos de 30min
            const slotsNeeded = Math.ceil(durationMin / 30);
            const apptEndMin = startMin + slotsNeeded * 30;

            // este slot está entre [start, apptEndMin) ?
            return (
              slotStartMinutes >= startMin && slotStartMinutes < apptEndMin
            );
          });

        // se não tem agendamento cobrindo esse slot -> botão vazio (criar)
        if (!appt) {
          return (
            <button
              key={pro.id}
              type="button"
              className="h-14 rounded-xl border border-slate-800/50 bg-slate-950/30 hover:border-emerald-500/60 hover:bg-slate-900/60 transition-colors text-left"
              onClick={() =>
                onCreateAppointment?.({
                  time: slot,
                  professionalId: pro.id,
                  professionalName: pro.name,
                })
              }
            />
          );
        }

        const statusStyles = getStatusClasses(appt.status);
        const isStart = timeStrToMinutes(appt.time) === slotStartMinutes;
        const billingType = (appt as any).billingType as
          | "plan"
          | "single"
          | undefined;
        const isRestored =
          Array.isArray(restoredPlanVisits) &&
          restoredPlanVisits.includes(appt.id);
        // se é o slot de início, mostra card completo
        if (isStart) {
          return (
            <div
              key={pro.id}
              className={`h-14 rounded-xl border px-2 py-1 flex flex-col justify-between cursor-pointer ${statusStyles.container}`}
              onClick={() => onChangeStatus?.(appt.id, appt.status)}
            >
              <p className="text-[11px] font-medium">{appt.serviceName}</p>
              <p className="text-[10px] text-slate-300">{appt.customerName}</p>

              {/* Linha de badges: status + tipo (Plano/Avulso) */}
              <div className="mt-0.5 flex items-center gap-1">
                <span
                  className={`text-[9px] px-1 rounded ${statusStyles.badge}`}
                >
                  {statusStyles.label}
                </span>

                <span
                  className={`text-[9px] px-1 rounded border ml-auto ${
                    billingType === "plan"
                      ? "bg-emerald-500/15 text-emerald-100 border-emerald-400/60"
                      : "bg-slate-700/40 text-slate-100 border-slate-500/60"
                  }`}
                >
                  {billingType === "plan" ? "Plano" : "Avulso"}
                </span>
              </div>

              {/* Ações rápidas: Falta / Cancelar (quando ainda não é falta/cancelado) */}
              {(appt.status === "scheduled" ||
                appt.status === "in_service") && (
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    className="text-[9px] px-1 rounded border border-amber-400/60 text-amber-200 bg-amber-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangeStatus?.(appt.id, appt.status, "no_show");
                    }}
                  >
                    Marcar falta
                  </button>
                  <button
                    type="button"
                    className="text-[9px] px-1 rounded border border-rose-400/60 text-rose-200 bg-rose-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangeStatus?.(appt.id, appt.status, "cancelled");
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {/* Botão para devolver visita do plano em caso de falta/cancelamento */}
              {billingType === "plan" &&
                (appt.status === "no_show" || appt.status === "cancelled") &&
                (isRestored ? (
                  <span className="mt-1 self-start text-[9px] px-1 rounded bg-emerald-600/20 text-emerald-200 border border-emerald-500/60">
                    Visita devolvida ao plano
                  </span>
                ) : (
                  <button
                    type="button"
                    className="mt-1 self-start text-[9px] px-1 rounded border border-emerald-400/60 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestorePlanVisit?.(appt.id);
                    }}
                  >
                    Devolver visita ao plano
                  </button>
                ))}
            </div>
          );
        }

        // continuação do agendamento (slot seguinte)
        return (
          <div
            key={pro.id}
            className={`h-14 rounded-xl border px-2 py-1 flex items-center text-[10px] text-slate-300 ${statusStyles.container}`}
          >
            <span className="truncate">
              Continuação · {appt.serviceName} · {appt.customerName} ·{" "}
              {billingType === "plan" ? "Plano" : "Avulso"}
            </span>
          </div>
        );
      })}
    </>
  );
}

function timeStrToMinutes(time: string): number {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr) || 0;
  const m = Number(mStr) || 0;
  return h * 60 + m;
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

function getNextStatusForClick(
  status: AgendaAppointment["status"]
): AgendaAppointment["status"] | null {
  switch (status) {
    case "scheduled":
      return "in_service";
    case "in_service":
      return "done";
    default:
      // done, no_show, cancelled -> não mudam via clique simples
      return null;
  }
}

function formatDateYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekdayLabel(date: Date): string {
  const formatter = new Intl.DateTimeFormat("pt-PT", { weekday: "long" });
  const label = formatter.format(date); // ex: "terça-feira"
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}
