"use client";

import { useSearchParams, useRouter } from "next/navigation";
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
import {
  fetchOwnerLocations,
  type OwnerLocation,
} from "../_api/owner-locations";

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
];

// manhã = horários antes das 14:00
const morningSlots = timeSlots.filter((t) => t < "14:00");

// tarde = horários a partir das 14:00
const afternoonSlots = timeSlots.filter((t) => t >= "14:00");

export default function OwnerAgendaPage() {
  // Protege a rota: só owner logado entra
  const { user, loading: authLoading } = useRequireAuth({
    requiredRole: "owner",
  });
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [professionals, setProfessionals] = useState<AgendaProfessional[]>([]);
  const [appointments, setAppointments] = useState<AgendaAppointment[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] =
    useState<FilterProfessionalId>("all");
  const [selectedLocationId, setSelectedLocationId] = useState<string | "all">(
    "all"
  );
  const [locations, setLocations] = useState<OwnerLocation[]>([]);
  const [viewMode, setViewMode] = useState<"daily" | "weekly">("daily");
  const [loadingAgenda, setLoadingAgenda] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [restoredPlanVisits, setRestoredPlanVisits] = useState<string[]>([]);
  const [selectedAppointment, setSelectedAppointment] =
    useState<AgendaAppointment | null>(null);

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
  const [didApplyLocationFromUrl, setDidApplyLocationFromUrl] = useState(false);
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

  function handleOpenAppointmentDetails(appt: AgendaAppointment) {
    setSelectedAppointment(appt);
  }

  function handleCloseDetailsModal() {
    setSelectedAppointment(null);
  }

  function handleDetailsStatusChange(
    forceStatus?: AgendaAppointment["status"]
  ) {
    if (!selectedAppointment) return;

    // usa o handler já existente
    handleChangeStatus(
      selectedAppointment.id,
      selectedAppointment.status,
      forceStatus
    );

    setSelectedAppointment(null);
  }

  function handleDetailsRestoreVisit() {
    if (!selectedAppointment) return;

    handleRestorePlanVisit(selectedAppointment.id);
    setSelectedAppointment(null);
  }

  function handlePrevDay() {
    setSelectedDate((prev) => addDays(prev, -1));
  }

  function handleNextDay() {
    setSelectedDate((prev) => addDays(prev, 1));
  }

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
    async function loadLocations() {
      if (authLoading) return;
      if (!user) return;

      try {
        const result = await fetchOwnerLocations({ page: 1, pageSize: 100 });
        setLocations(result.data);
      } catch (err) {
        console.error("Erro ao carregar unidades:", err);
        // não quebra a agenda se der erro
      }
    }

    loadLocations();
  }, [authLoading, user]);
  useEffect(() => {
    if (didApplyLocationFromUrl) return;

    const locationIdFromUrl = searchParams.get("locationId");
    if (!locationIdFromUrl) return;

    // só aplica se existir na lista (evita select ficar com value inválido)
    const exists = locations.some((l) => l.id === locationIdFromUrl);
    if (!exists) return;

    setSelectedLocationId(locationIdFromUrl);
    setSelectedProfessionalId("all"); // garante que não fica preso num profissional de outra unidade
    setDidApplyLocationFromUrl(true);
  }, [didApplyLocationFromUrl, searchParams, locations]);

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

  // Serviços que serão exibidos no select
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

  // Garante que, ao usar plano, o serviço selecionado seja permitido pelo plano
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

      const now = new Date();
      if (startDate <= now) {
        setCreateError(
          "Não é possível criar agendamentos em horários que já passaram."
        );
        return;
      }

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

  // Profissionais filtrados por unidade
  const professionalsByLocation =
    selectedLocationId === "all"
      ? professionals
      : professionals.filter(
          (pro: any) => pro.locationId === selectedLocationId
        );
  const isSpecificLocationSelected = selectedLocationId !== "all";
  const locationHasNoProfessionals =
    isSpecificLocationSelected && professionalsByLocation.length === 0;

  // Profissionais visíveis considerando unidade + filtro específico
  const visibleProfessionals =
    selectedProfessionalId === "all"
      ? professionalsByLocation
      : professionalsByLocation.filter(
          (pro) => pro.id === selectedProfessionalId
        );

  const weekdayLabel = getWeekdayLabel(selectedDate);

  const locationOptions = useMemo(() => locations, [locations]);

  const today = new Date();
  const todayStr = formatDateYYYYMMDD(today);
  const selectedDateStr = formatDateYYYYMMDD(selectedDate);
  const maxDate = addDays(today, 30);
  const maxDateStr = formatDateYYYYMMDD(maxDate);

  const isToday = selectedDateStr === todayStr;
  const isPastDay = selectedDateStr < todayStr;
  const nowMinutes = today.getHours() * 60 + today.getMinutes();

  // label bonitinho
  const dateLabel = isToday
    ? `Hoje · ${weekdayLabel}`
    : `${selectedDate.toLocaleDateString("pt-PT")} · ${weekdayLabel}`;

  async function findNextDayWithFreeSlot(
    baseDate: Date,
    professionalFilter: FilterProfessionalId,
    locationFilter: string | "all"
  ): Promise<Date | null> {
    const today = new Date();
    const todayStr = formatDateYYYYMMDD(today);
    const nowMinutesToday = today.getHours() * 60 + today.getMinutes();
    const maxDaysToSearch = 60; // limite de 60 dias para não ficar infinito

    let current = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate(),
      0,
      0,
      0,
      0
    );

    for (let i = 0; i < maxDaysToSearch; i++) {
      const currentStr = formatDateYYYYMMDD(current);
      const data = await fetchOwnerAgendaDay(currentStr);

      const prosByLocation =
        locationFilter === "all"
          ? data.professionals
          : data.professionals.filter(
              (p: any) => p.locationId === locationFilter
            );

      const prosForSearch =
        professionalFilter === "all"
          ? prosByLocation
          : prosByLocation.filter((p) => p.id === professionalFilter);

      if (!prosForSearch.length) {
        current = addDays(current, 1);
        continue;
      }

      const isDayPast = currentStr < todayStr;
      const isDayToday = currentStr === todayStr;

      let hasFreeSlot = false;

      outer: for (const slot of timeSlots) {
        const slotStartMinutes = timeStrToMinutes(slot);
        const slotEndMinutes = slotStartMinutes + 30;

        // não considerar slots já passados
        if (isDayPast || (isDayToday && slotEndMinutes <= nowMinutesToday)) {
          continue;
        }

        for (const pro of prosForSearch) {
          const appt = data.appointments
            .filter(
              (a) => a.professionalId === pro.id && a.status !== "cancelled"
            )
            .find((a) => {
              const startMin = timeStrToMinutes(a.time);
              const durationMin = ((a as any).serviceDurationMin ??
                (a as any).durationMin ??
                30) as number;
              const slotsNeeded = Math.ceil(durationMin / 30);
              const apptEndMin = startMin + slotsNeeded * 30;

              return (
                slotStartMinutes >= startMin && slotStartMinutes < apptEndMin
              );
            });

          // se algum profissional está livre nesse slot, já serve
          if (!appt) {
            hasFreeSlot = true;
            break outer;
          }
        }
      }

      if (hasFreeSlot) {
        return current;
      }

      current = addDays(current, 1);
    }

    return null;
  }

  async function handleGoToNextFreeSlot() {
    try {
      setError(null);
      setLoadingAgenda(true);

      const today = new Date();
      const base = selectedDate < today ? today : selectedDate;

      const nextDate = await findNextDayWithFreeSlot(
        base,
        selectedProfessionalId,
        selectedLocationId
      );

      if (!nextDate) {
        setError(
          "Não encontramos nenhum horário livre nos próximos dias para este filtro."
        );
        return;
      }

      setSelectedDate(
        new Date(
          nextDate.getFullYear(),
          nextDate.getMonth(),
          nextDate.getDate(),
          0,
          0,
          0,
          0
        )
      );
    } catch (err) {
      console.error("Erro ao procurar próximo horário livre:", err);
      setError(
        "Não foi possível procurar o próximo horário livre. Tente novamente."
      );
    } finally {
      setLoadingAgenda(false);
    }
  }

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
              <button
                type="button"
                className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-300"
                onClick={handlePrevDay}
              >
                {"<"}
              </button>

              <button
                type="button"
                className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-300"
                onClick={handleNextDay}
              >
                {">"}
              </button>

              <button className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900/80">
                {dateLabel}
              </button>

              <input
                type="date"
                className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200 text-xs"
                value={selectedDateStr}
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
            Visão diária por profissional, com filtro por unidade.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-300"
              onClick={handlePrevDay}
            >
              {"<"}
            </button>

            <button
              type="button"
              className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-300"
              onClick={handleNextDay}
            >
              {">"}
            </button>

            <button className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900/80">
              {dateLabel}
            </button>

            <input
              type="date"
              className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200 text-xs"
              value={selectedDateStr}
              max={maxDateStr}
              onChange={(e) => {
                if (!e.target.value) return;
                const [y, m, d] = e.target.value.split("-").map(Number);
                setSelectedDate(new Date(y, m - 1, d, 0, 0, 0, 0));
              }}
            />
          </div>

          {/* Filtro de unidade */}
          <select
            className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200"
            value={selectedLocationId}
            onChange={(e) =>
              setSelectedLocationId((e.target.value || "all") as string | "all")
            }
          >
            <option value="all">Todas as unidades</option>
            {locationOptions.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>

          {/* Filtro de profissional (respeitando unidade) */}
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
            {professionalsByLocation.map((pro) => (
              <option key={pro.id} value={pro.id}>
                {pro.name}
              </option>
            ))}
          </select>

          {/* Toggle Diário / Semanal */}
          <div className="flex rounded-lg border border-slate-800 bg-slate-900/80 overflow-hidden">
            <button
              type="button"
              className={`px-3 py-1 text-[11px] ${
                viewMode === "daily"
                  ? "text-slate-50 bg-slate-800"
                  : "text-slate-400"
              }`}
              onClick={() => setViewMode("daily")}
            >
              Diário
            </button>
            <button
              type="button"
              className={`px-3 py-1 text-[11px] ${
                viewMode === "weekly"
                  ? "text-slate-50 bg-slate-800"
                  : "text-slate-400"
              }`}
              onClick={() => setViewMode("weekly")}
            >
              Semanal
            </button>
          </div>

          <button
            type="button"
            className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-[11px] text-emerald-200"
            onClick={handleGoToNextFreeSlot}
          >
            Próximo horário livre
          </button>
        </div>
      </header>

      {/* Resumo rápido do dia */}
      <section className="mb-4 grid gap-2 text-xs md:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
          <p className="text-[11px] text-slate-400">Agendamentos do dia</p>
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

          <button
            type="button"
            className="mt-2 text-[11px] text-emerald-400 hover:underline"
            onClick={() => router.push("/owner/relatorios")}
          >
            Análise detalhada
          </button>
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
      {locationHasNoProfessionals && (
        <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-amber-200/80">
              Unidade sem profissionais
            </p>
            <p className="text-[12px] text-amber-100">
              Essa unidade ainda não tem nenhum profissional vinculado.
            </p>
          </div>

          <button
            type="button"
            className="shrink-0 px-3 py-1 rounded-lg border border-amber-400 bg-amber-500/10 text-[11px] text-amber-100 hover:bg-amber-500/20"
            onClick={() => {
              const returnTo = encodeURIComponent(
                `/owner/agenda?locationId=${selectedLocationId}`
              );
              router.push(
                `/owner/profissionais?locationId=${selectedLocationId}&openCreate=1&returnTo=${returnTo}`
              );
            }}
          >
            Vincular agora
          </button>
        </div>
      )}

      {/* VISÃO DIÁRIA / SEMANAL */}
      {viewMode === "daily" ? (
        <>
          {/* Grid da agenda diária: manhã e tarde lado a lado */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="grid gap-6 md:grid-cols-2">
              {/* COLUNA DA MANHÃ */}
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
                  Período da manhã
                </p>

                <div
                  className="grid gap-2 text-xs"
                  style={{
                    gridTemplateColumns: `80px repeat(${visibleProfessionals.length}, minmax(0, 1fr))`,
                  }}
                >
                  {/* coluna de horários à esquerda */}
                  <div />

                  {/* cabeçalhos de profissionais */}
                  {visibleProfessionals.map((pro) => (
                    <div
                      key={pro.id}
                      className="px-2 py-2 rounded-2xl border border-slate-700/80 bg-slate-950/70 flex flex-col"
                    >
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">
                        Profissional
                      </span>
                      <span className="text-sm font-semibold text-slate-50">
                        {pro.name}
                      </span>
                    </div>
                  ))}

                  {morningSlots.map((slot) => (
                    <RowTimeSlot
                      key={slot}
                      slot={slot}
                      professionals={visibleProfessionals}
                      appointments={appointments}
                      onCreateAppointment={handleCreateAppointmentClick}
                      onOpenDetails={handleOpenAppointmentDetails}
                      isPastDay={isPastDay}
                      isToday={isToday}
                      nowMinutes={nowMinutes}
                    />
                  ))}
                </div>
              </div>

              {/* COLUNA DA TARDE */}
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
                  Período da tarde
                </p>

                <div
                  className="grid gap-2 text-xs"
                  style={{
                    gridTemplateColumns: `80px repeat(${visibleProfessionals.length}, minmax(0, 1fr))`,
                  }}
                >
                  {/* coluna de horários à esquerda */}
                  <div />

                  {/* cabeçalhos de profissionais */}
                  {visibleProfessionals.map((pro) => (
                    <div
                      key={pro.id}
                      className="px-2 py-2 rounded-2xl border border-slate-700/80 bg-slate-950/70 flex flex-col"
                    >
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">
                        Profissional
                      </span>
                      <span className="text-sm font-semibold text-slate-50">
                        {pro.name}
                      </span>
                    </div>
                  ))}

                  {/* linhas de horários da tarde */}
                  {afternoonSlots.map((slot) => (
                    <RowTimeSlot
                      key={slot}
                      slot={slot}
                      professionals={visibleProfessionals}
                      appointments={appointments}
                      onCreateAppointment={handleCreateAppointmentClick}
                      onOpenDetails={handleOpenAppointmentDetails}
                      isPastDay={isPastDay}
                      isToday={isToday}
                      nowMinutes={nowMinutes}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-300">
          <p className="mb-1 font-semibold text-slate-100">
            Visão semanal em construção
          </p>
          <p>
            Por enquanto, utilize a visão diária para gerir os agendamentos.
            Quando avançarmos, esta aba vai mostrar o mapa da semana inteira por
            profissional/unidade.
          </p>
        </section>
      )}

      {selectedAppointment &&
        (() => {
          const statusStyles = getStatusClasses(selectedAppointment.status);
          const billingType = (selectedAppointment as any).billingType as
            | "plan"
            | "single"
            | undefined;

          return (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
              <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs shadow-xl">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">
                      Detalhes do agendamento
                    </p>
                    <p className="text-sm font-semibold text-slate-100">
                      {selectedAppointment.serviceName}
                    </p>
                    <p className="text-[11px] text-slate-300">
                      Cliente: {selectedAppointment.customerName}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Horário: {selectedAppointment.time}
                    </p>
                  </div>

                  <button
                    className="text-[11px] text-slate-400 hover:text-slate-100"
                    onClick={handleCloseDetailsModal}
                  >
                    Fechar
                  </button>
                </div>

                <div className="flex gap-2 mb-4">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded ${statusStyles.badge}`}
                  >
                    {statusStyles.label}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded border ${
                      billingType === "plan"
                        ? "bg-emerald-500/15 text-emerald-100 border-emerald-400/60"
                        : "bg-slate-700/40 text-slate-100 border-slate-500/60"
                    }`}
                  >
                    {billingType === "plan" ? "Plano" : "Avulso"}
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  {selectedAppointment.status === "scheduled" && (
                    <button
                      type="button"
                      className="w-full px-3 py-1 rounded-lg border border-emerald-500 bg-emerald-500/10 text-[11px] text-emerald-100"
                      onClick={() => handleDetailsStatusChange()}
                    >
                      Iniciar atendimento
                    </button>
                  )}

                  {selectedAppointment.status === "in_service" && (
                    <button
                      type="button"
                      className="w-full px-3 py-1 rounded-lg border border-sky-500 bg-sky-500/10 text-[11px] text-sky-100"
                      onClick={() => handleDetailsStatusChange()}
                    >
                      Marcar como concluído
                    </button>
                  )}

                  {(selectedAppointment.status === "scheduled" ||
                    selectedAppointment.status === "in_service") && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="flex-1 px-3 py-1 rounded-lg border border-amber-400 bg-amber-500/10 text-[11px] text-amber-200"
                        onClick={() => handleDetailsStatusChange("no_show")}
                      >
                        Marcar falta
                      </button>
                      <button
                        type="button"
                        className="flex-1 px-3 py-1 rounded-lg border border-rose-400 bg-rose-500/10 text-[11px] text-rose-200"
                        onClick={() => handleDetailsStatusChange("cancelled")}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                  {billingType === "plan" &&
                    (selectedAppointment.status === "no_show" ||
                      selectedAppointment.status === "cancelled") && (
                      <button
                        type="button"
                        className="w-full px-3 py-1 rounded-lg border border-emerald-400 bg-emerald-500/10 text-[11px] text-emerald-200"
                        onClick={handleDetailsRestoreVisit}
                      >
                        Devolver visita ao plano
                      </button>
                    )}
                </div>

                <p className="text-[10px] text-slate-500">
                  Dica: use este painel para controlar status, faltas e exceções
                  de forma segura, sem lotar o slot da agenda.
                </p>
              </div>
            </div>
          );
        })()}

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
                  {visibleProfessionals.map((pro) => (
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
  onCreateAppointment,
  onOpenDetails,
  isPastDay,
  isToday,
  nowMinutes,
}: {
  slot: string;
  professionals: AgendaProfessional[];
  appointments: AgendaAppointment[];
  onCreateAppointment?: (params: {
    time: string;
    professionalId: string;
    professionalName: string;
  }) => void;
  onOpenDetails?: (appointment: AgendaAppointment) => void;
  isPastDay: boolean;
  isToday: boolean;
  nowMinutes: number;
}) {
  const slotStartMinutes = timeStrToMinutes(slot);
  const slotEndMinutes = slotStartMinutes + 30; // cada slot = 30min

  const isPastSlot = isPastDay || (isToday && slotEndMinutes <= nowMinutes);

  return (
    <>
      {/* Coluna de horário (esquerda) */}
      <div className="flex items-start justify-end pr-1 pt-2 text-[10px] text-slate-500">
        {slot}
      </div>

      {/* Colunas por profissional */}
      {professionals.map((pro) => {
        const appt = appointments
          .filter(
            (a) => a.professionalId === pro.id && a.status !== "cancelled"
          )
          .find((a) => {
            const startMin = timeStrToMinutes(a.time);
            const durationMin = ((a as any).serviceDurationMin ??
              (a as any).durationMin ??
              30) as number;

            const slotsNeeded = Math.ceil(durationMin / 30);
            const apptEndMin = startMin + slotsNeeded * 30;

            return (
              slotStartMinutes >= startMin && slotStartMinutes < apptEndMin
            );
          });

        // Sem agendamento ocupando este slot
        if (!appt) {
          if (isPastSlot) {
            return (
              <div
                key={pro.id}
                className="h-14 rounded-xl border border-slate-900/60 bg-slate-950/40 opacity-40 cursor-not-allowed"
              />
            );
          }

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

        // Slot de início -> card compacto clicável
        if (isStart) {
          return (
            <button
              key={pro.id}
              type="button"
              className={`h-14 w-full rounded-xl border px-2 py-1.5 flex items-start justify-between text-left ${statusStyles.container}`}
              onClick={() => onOpenDetails?.(appt)}
            >
              <div className="min-w-0">
                <p className="text-[11px] font-medium truncate">
                  {appt.serviceName}
                </p>
                <p className="text-[10px] text-slate-300 truncate">
                  Cliente: {appt.customerName}
                </p>
              </div>

              <div className="flex flex-col items-end gap-1">
                <span
                  className={`text-[9px] px-1 rounded ${statusStyles.badge}`}
                >
                  {statusStyles.label}
                </span>
                <span
                  className={`text-[9px] px-1 rounded border ${
                    billingType === "plan"
                      ? "bg-emerald-500/15 text-emerald-100 border-emerald-400/60"
                      : "bg-slate-700/40 text-slate-100 border-slate-500/60"
                  }`}
                >
                  {billingType === "plan" ? "Plano" : "Avulso"}
                </span>
              </div>
            </button>
          );
        }

        // Continuação do agendamento -> também abre detalhes se clicar
        return (
          <button
            key={pro.id}
            type="button"
            className={`h-14 rounded-xl border px-2 py-1 flex items-center text-[10px] text-slate-300 text-left ${statusStyles.container}`}
            onClick={() => onOpenDetails?.(appt)}
          >
            <span className="truncate">
              Continuação · {appt.serviceName} · {appt.customerName} ·{" "}
              {billingType === "plan" ? "Plano" : "Avulso"}
            </span>
          </button>
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
