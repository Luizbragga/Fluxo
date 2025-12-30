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
import { fetchOwnerTenantSettings } from "../_api/owner-tenant-settings";

type PendingAppointmentSlot = {
  time: string;
  professionalId: string;
  professionalName: string;
};
type WeekDayStats = {
  total: number;
  planCount: number;
  avulsoCount: number;
  scheduled: number;
  done: number;
  noShow: number;
  cancelled: number;
};

type WeekDayItem = {
  id: string;
  time: string;
  serviceName: string;
  customerName: string;
  status: AgendaAppointment["status"];
  billingType?: "plan" | "single";
};

type WeekDayData = {
  date: Date;
  dateStr: string;
  weekdayShort: string;
  dayLabel: string;
  isToday: boolean;
  stats: WeekDayStats;
  items: WeekDayItem[]; // lista completa do dia
};

type FilterProfessionalId = string | "all";

// -----------------------
// Slots (dinâmico por unidade)
// -----------------------

const DEFAULT_TIME_SLOTS = [
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

type DayInterval = { start: string; end: string };

// tolerante: aceita keys em EN (mon) ou PT (seg), e template como string JSON ou objeto
function getWeekdayCandidateKeys(date: Date): string[] {
  // 0=dom, 1=seg...
  const map: string[][] = [
    ["sun", "dom", "domingo"],
    ["mon", "seg", "segunda"],
    ["tue", "ter", "terça", "terca"],
    ["wed", "qua", "quarta"],
    ["thu", "qui", "quinta"],
    ["fri", "sex", "sexta"],
    ["sat", "sab", "sábado", "sabado"],
  ];
  return map[date.getDay()] ?? [];
}

function tryParseTemplate(raw: any): any {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

function normalizeIntervals(raw: any): DayInterval[] {
  // esperado: [["08:00","12:00"],["14:00","20:00"]] (ou variações)
  if (!Array.isArray(raw)) return [];

  return raw
    .map((pair: any) => {
      if (!Array.isArray(pair) || pair.length < 2) return null;
      const start = String(pair[0] ?? "").trim();
      const end = String(pair[1] ?? "").trim();
      if (!start || !end) return null;
      return { start, end } as DayInterval;
    })
    .filter(Boolean) as DayInterval[];
}

function buildSlotsFromIntervals(
  intervals: DayInterval[],
  stepMin = 30
): string[] {
  const out: string[] = [];

  for (const itv of intervals) {
    const startMin = timeStrToMinutes(itv.start);
    const endMin = timeStrToMinutes(itv.end);

    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) continue;
    if (endMin <= startMin) continue;

    for (let m = startMin; m <= endMin; m += stepMin) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      const label = `${hh}:${mm}`;

      // garante que não passa do fim (ex.: se end=12:00, inclui 12:00, mas não 12:30)
      if (m > endMin) break;

      out.push(label);
    }
  }

  // remove duplicados e ordena
  return Array.from(new Set(out)).sort();
}

function getLocationDayIntervals(location: any, date: Date): DayInterval[] {
  // tenta encontrar onde tá salvo o template na location
  // (ajusta aqui se teu backend usar outro nome)
  const templateRaw =
    location?.businessHoursTemplate ??
    location?.weekdayTemplate ??
    location?.hoursTemplate ??
    location?.scheduleTemplate ??
    location?.workingHoursTemplate ??
    null;

  const template = tryParseTemplate(templateRaw);
  if (!template) return [];

  const keys = getWeekdayCandidateKeys(date);

  for (const k of keys) {
    if (template && Object.prototype.hasOwnProperty.call(template, k)) {
      return normalizeIntervals(template[k]);
    }
  }

  return [];
}

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
  const [tenantSettings, setTenantSettings] = useState<{
    bookingIntervalMin?: number;
    bufferBetweenAppointmentsMin?: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadTenantSettings() {
      if (authLoading) return;
      if (!user) return;

      try {
        const s = await fetchOwnerTenantSettings();
        if (!alive) return;
        setTenantSettings(s);
      } catch (err) {
        console.error("Erro ao carregar tenant settings:", err);
        if (!alive) return;
        setTenantSettings(null);
      }
    }

    loadTenantSettings();

    return () => {
      alive = false;
    };
  }, [authLoading, user]);
  const selectedLocation = useMemo(() => {
    if (selectedLocationId === "all") return null;
    return locations.find((l) => l.id === selectedLocationId) ?? null;
  }, [locations, selectedLocationId]);

  const agendaStepMin = useMemo(() => {
    const raw =
      selectedLocation?.bookingIntervalMin ??
      tenantSettings?.bookingIntervalMin;

    const allowed = [5, 10, 15, 20, 30, 45, 60] as const;

    if (!raw) return 30;
    return (allowed as readonly number[]).includes(raw) ? raw : 30;
  }, [
    selectedLocation?.bookingIntervalMin,
    tenantSettings?.bookingIntervalMin,
  ]);

  const agendaBufferMin = useMemo(() => {
    const raw =
      (selectedLocation as any)?.bookingBufferMin ??
      (tenantSettings as any)?.bookingBufferMin ??
      (tenantSettings as any)?.bufferMin; // fallback se teu backend tiver outro nome

    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) return 0;

    // evita maluquice
    return Math.min(v, 60);
  }, [selectedLocation, tenantSettings]);

  const bufferBetweenAppointmentsMin = useMemo(() => {
    const raw = tenantSettings?.bufferBetweenAppointmentsMin;

    if (typeof raw !== "number") return 0;
    if (!Number.isFinite(raw)) return 0;

    // segurança básica (não deixa negativo nem valores absurdos)
    if (raw < 0) return 0;
    if (raw > 60) return 60;

    return Math.floor(raw);
  }, [tenantSettings?.bufferBetweenAppointmentsMin]);

  const [weekDays, setWeekDays] = useState<WeekDayData[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [weekError, setWeekError] = useState<string | null>(null);
  const [loadingAgenda, setLoadingAgenda] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [restoredPlanVisits, setRestoredPlanVisits] = useState<string[]>([]);
  const [selectedAppointment, setSelectedAppointment] =
    useState<AgendaAppointment | null>(null);

  const [selectedOverbooking, setSelectedOverbooking] = useState<null | {
    slotTime: string;
    professionalId: string;
    professionalName: string;
    appointments: AgendaAppointment[];
  }>(null);

  useEffect(() => {
    if (!selectedLocation) return;
    console.log("selectedLocation:", selectedLocation);
  }, [selectedLocation]);

  const dayIntervals = useMemo(() => {
    if (!selectedLocation) return null;
    return getLocationDayIntervals(selectedLocation as any, selectedDate);
  }, [selectedLocation, selectedDate]);

  const dayTimeSlots = useMemo(() => {
    // se estiver em "todas", mantém o comportamento atual (por enquanto)
    if (!dayIntervals) return DEFAULT_TIME_SLOTS;
    return buildSlotsFromIntervals(dayIntervals, agendaStepMin);
  }, [dayIntervals, agendaStepMin]);

  // para manter tua UI de “manhã/tarde”, usamos até 2 intervalos quando existir
  const morningSlots = useMemo(() => {
    if (!dayIntervals) return DEFAULT_TIME_SLOTS.filter((t) => t < "14:00");
    const first = dayIntervals[0] ? [dayIntervals[0]] : [];
    return buildSlotsFromIntervals(first, agendaStepMin);
  }, [dayIntervals, agendaStepMin]);

  const afternoonSlots = useMemo(() => {
    if (!dayIntervals) return DEFAULT_TIME_SLOTS.filter((t) => t >= "14:00");
    const second = dayIntervals[1] ? [dayIntervals[1]] : [];
    return buildSlotsFromIntervals(second, agendaStepMin);
  }, [dayIntervals, agendaStepMin]);

  // Slot clicado para criar agendamento
  const [pendingSlot, setPendingSlot] = useState<PendingAppointmentSlot | null>(
    null
  );

  const overbookingCount = useMemo(() => {
    if (!pendingSlot) return 0;

    return appointments.filter(
      (a) =>
        a.status !== "cancelled" &&
        a.professionalId === pendingSlot.professionalId &&
        a.time === pendingSlot.time
    ).length;
  }, [appointments, pendingSlot]);

  const isOverbookingNow = overbookingCount > 0;

  const [modalCustomerName, setModalCustomerName] = useState("");
  const [modalCustomerPhone, setModalCustomerPhone] = useState("");

  const searchParams = useSearchParams();
  useEffect(() => {
    const view = searchParams.get("view");
    if (view === "weekly") setViewMode("weekly");
    if (view === "daily") setViewMode("daily");
  }, [searchParams]);

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
  function handleOpenOverbooking(params: {
    slotTime: string;
    professionalId: string;
    professionalName: string;
    appointments: AgendaAppointment[];
  }) {
    setSelectedOverbooking(params);
  }

  function handleCloseOverbookingModal() {
    setSelectedOverbooking(null);
  }

  function handlePickOverbookingAppointment(appt: AgendaAppointment) {
    setSelectedOverbooking(null);
    setSelectedAppointment(appt); // reutiliza o modal atual de detalhes
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
    const step = viewMode === "weekly" ? -7 : -1;
    setSelectedDate((prev) => addDays(prev, step));
  }

  function handleNextDay() {
    const step = viewMode === "weekly" ? 7 : 1;
    setSelectedDate((prev) => addDays(prev, step));
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
  }, [authLoading, user, selectedLocationId]);

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
  function resetCreateAppointmentForm() {
    setCreateError(null);

    // Se veio da tela de clientes (via URL), mantém prefill.
    // Se não veio, zera.
    setModalCustomerName(customerNameFromUrl ?? "");
    setModalCustomerPhone(customerPhoneFromUrl ?? "");

    // Regra atual: se tiver customerPlanId na URL, começa marcado como plano
    setUsePlanForAppointment(!!customerPlanIdFromUrl);
  }

  function handleCreateAppointmentClick(slot: PendingAppointmentSlot) {
    resetCreateAppointmentForm();

    setCreateError(null);
    setPendingSlot(slot);

    // profissional do slot clicado
    setModalProviderId(slot.professionalId);
  }
  function getProfessionalNameById(proId: string) {
    return professionals.find((p) => p.id === proId)?.name ?? "Profissional";
  }

  function handleCreateOverbookingFromAppointment(appt: AgendaAppointment) {
    // fecha o modal atual
    setSelectedAppointment(null);
    setSelectedOverbooking(null);

    // abre o modal de criar no MESMO horário/profissional
    handleCreateAppointmentClick({
      time: appt.time,
      professionalId: appt.professionalId,
      professionalName: getProfessionalNameById(appt.professionalId),
    });
  }

  function handleCloseCreateModal() {
    resetCreateAppointmentForm();

    setPendingSlot(null);
    setModalProviderId("");

    setCreateError(null);
    setModalCustomerName(customerNameFromUrl ?? "");
    setModalCustomerPhone(customerPhoneFromUrl ?? "");
    setUsePlanForAppointment(!!customerPlanIdFromUrl);
    setSelectedServiceId((services?.[0]?.id as string) ?? "");
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

      // Fecha o modal e reseta o form
      resetCreateAppointmentForm();
      setPendingSlot(null);
      setModalProviderId("");
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
  const visibleProIdsKey = useMemo(() => {
    return visibleProfessionals
      .map((p) => p.id)
      .sort()
      .join("|");
  }, [visibleProfessionals]);

  useEffect(() => {
    let alive = true;

    async function loadWeek() {
      if (viewMode !== "weekly") return;
      if (authLoading) return;
      if (!user) return;

      try {
        setWeekError(null);
        setLoadingWeek(true);

        const today = new Date();
        const todayStr = formatDateYYYYMMDD(today);

        const start = startOfWeekMonday(selectedDate);
        const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

        const proIdSet = new Set(visibleProfessionals.map((p) => p.id));

        const results = await Promise.all(
          days.map(async (d) => {
            const dateStr = formatDateYYYYMMDD(d);
            const data = await fetchOwnerAgendaDay(dateStr);

            const filtered = data.appointments.filter((a) =>
              proIdSet.has(a.professionalId)
            );

            let planCount = 0;
            let avulsoCount = 0;
            let scheduled = 0;
            let done = 0;
            let noShow = 0;
            let cancelled = 0;

            for (const appt of filtered) {
              if ((appt as any).billingType === "plan") planCount++;
              else avulsoCount++;

              switch (appt.status) {
                case "scheduled":
                  scheduled++;
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

            // ✅ lista completa do dia (ordenada)
            const items = filtered
              .slice()
              .sort(
                (a, b) => timeStrToMinutes(a.time) - timeStrToMinutes(b.time)
              )
              .map((a) => ({
                id: a.id,
                time: a.time,
                serviceName: a.serviceName,
                customerName: a.customerName,
                status: a.status,
                billingType: (a as any).billingType,
              }));

            const weekdayShort = new Intl.DateTimeFormat("pt-PT", {
              weekday: "short",
            })
              .format(d)
              .replace(".", "");

            const dayLabel = `${weekdayShort
              .charAt(0)
              .toUpperCase()}${weekdayShort.slice(1)} · ${d.toLocaleDateString(
              "pt-PT",
              {
                day: "2-digit",
                month: "2-digit",
              }
            )}`;

            const isToday = formatDateYYYYMMDD(d) === todayStr;

            const dayData: WeekDayData = {
              date: d,
              dateStr,
              weekdayShort,
              dayLabel,
              isToday,
              stats: {
                total: filtered.length,
                planCount,
                avulsoCount,
                scheduled,
                done,
                noShow,
                cancelled,
              },
              items,
            };

            return dayData;
          })
        );

        if (!alive) return;
        setWeekDays(results);
      } catch (err) {
        console.error("Erro ao carregar visão semanal:", err);
        if (!alive) return;
        setWeekError("Erro ao carregar a visão semanal.");
      } finally {
        if (alive) setLoadingWeek(false);
      }
    }

    loadWeek();

    return () => {
      alive = false;
    };
  }, [viewMode, selectedDate, visibleProIdsKey, authLoading, user]);

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
  const overbookingEnabled = Boolean(
    (selectedLocation as any)?.overbookingEnabled ??
      (tenantSettings as any)?.overbookingEnabled ??
      true // fallback: se ainda não tiver settings no backend, deixa ligado pra testar
  );

  const overbookingMaxPerSlot = (() => {
    const raw =
      (selectedLocation as any)?.overbookingMaxPerSlot ??
      (selectedLocation as any)?.maxOverbookingPerSlot ??
      (tenantSettings as any)?.overbookingMaxPerSlot ??
      (tenantSettings as any)?.maxOverbookingPerSlot ??
      2; // padrão: 2 no mesmo horário
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 1) return 1;
    return Math.min(v, 10);
  })();

  function canOverbookSlot(proId: string, slotTime: string) {
    if (!overbookingEnabled) return false;

    // não deixa encaixar em horário já passado (mantém coerência com teu save)
    const slotStart = timeStrToMinutes(slotTime);
    const slotEnd = slotStart + agendaStepMin;
    const isPastSlot = isPastDay || (isToday && slotEnd <= nowMinutes);
    if (isPastSlot) return false;

    const currentCount = appointments.filter(
      (a) =>
        a.professionalId === proId &&
        a.time === slotTime &&
        a.status !== "cancelled"
    ).length;

    return currentCount < overbookingMaxPerSlot;
  }

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
      const stepMinForSearch =
        locationFilter === "all"
          ? tenantSettings?.bookingIntervalMin ?? 30
          : locations.find((l) => l.id === locationFilter)
              ?.bookingIntervalMin ??
            tenantSettings?.bookingIntervalMin ??
            30;
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

      const slotsForDay =
        locationFilter === "all"
          ? DEFAULT_TIME_SLOTS
          : (() => {
              const loc = locations.find((l) => l.id === locationFilter);
              if (!loc) return DEFAULT_TIME_SLOTS;

              const step =
                loc.bookingIntervalMin ??
                tenantSettings?.bookingIntervalMin ??
                30;

              const intervals = getLocationDayIntervals(loc as any, current);
              return buildSlotsFromIntervals(intervals, step);
            })();

      outer: for (const slot of slotsForDay) {
        const slotStartMinutes = timeStrToMinutes(slot);
        const slotEndMinutes = slotStartMinutes + stepMinForSearch;

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
              const slotsNeeded = Math.ceil(durationMin / stepMinForSearch);
              const apptEndMin = startMin + slotsNeeded * stepMinForSearch;

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
                  className="grid gap-3 text-xs"
                  style={{
                    gridTemplateColumns: `repeat(${visibleProfessionals.length}, minmax(0, 1fr))`,
                  }}
                >
                  {visibleProfessionals.map((pro) => (
                    <div key={pro.id} className="flex flex-col gap-2">
                      {/* cabeçalho do profissional */}
                      <div className="px-2 py-2 rounded-2xl border border-slate-700/80 bg-slate-950/70 flex flex-col">
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">
                          Profissional
                        </span>
                        <span className="text-sm font-semibold text-slate-50">
                          {pro.name}
                        </span>
                      </div>

                      {/* timeline do período */}
                      <ProfessionalTimeline
                        pro={pro}
                        periodLabel="Manhã"
                        periodStart={morningSlots?.[0] ?? "08:00"}
                        periodEnd={
                          morningSlots?.[morningSlots.length - 1] ?? "13:45"
                        }
                        stepMin={agendaStepMin}
                        bufferMin={bufferBetweenAppointmentsMin}
                        onOpenOverbooking={handleOpenOverbooking}
                        appointments={appointments}
                        onCreateAppointment={handleCreateAppointmentClick}
                        onOpenDetails={handleOpenAppointmentDetails}
                        isPastDay={isPastDay}
                        isToday={isToday}
                        nowMinutes={nowMinutes}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* COLUNA DA TARDE */}
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
                  Período da tarde
                </p>

                <div
                  className="grid gap-3 text-xs"
                  style={{
                    gridTemplateColumns: `repeat(${visibleProfessionals.length}, minmax(0, 1fr))`,
                  }}
                >
                  {visibleProfessionals.map((pro) => (
                    <div key={pro.id} className="flex flex-col gap-2">
                      {/* cabeçalho do profissional */}
                      <div className="px-2 py-2 rounded-2xl border border-slate-700/80 bg-slate-950/70 flex flex-col">
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">
                          Profissional
                        </span>
                        <span className="text-sm font-semibold text-slate-50">
                          {pro.name}
                        </span>
                      </div>

                      {/* timeline do período */}
                      <ProfessionalTimeline
                        pro={pro}
                        periodLabel="Tarde"
                        periodStart={afternoonSlots?.[0] ?? "14:00"}
                        periodEnd={
                          afternoonSlots?.[afternoonSlots.length - 1] ?? "20:00"
                        }
                        stepMin={agendaStepMin}
                        bufferMin={bufferBetweenAppointmentsMin}
                        onOpenOverbooking={handleOpenOverbooking}
                        appointments={appointments}
                        onCreateAppointment={handleCreateAppointmentClick}
                        onOpenDetails={handleOpenAppointmentDetails}
                        isPastDay={isPastDay}
                        isToday={isToday}
                        nowMinutes={nowMinutes}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Visão semanal
              </p>
              <p className="text-xs text-slate-300">
                {getWeekRangeLabel(selectedDate)}
              </p>
              <p className="text-[11px] text-slate-500">
                Mostrando apenas os profissionais do filtro atual.
              </p>
            </div>

            <button
              type="button"
              className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-[11px] text-slate-200 hover:bg-slate-900"
              onClick={() => setViewMode("daily")}
            >
              Voltar ao diário
            </button>
          </div>

          {weekError ? (
            <div className="text-xs text-rose-400">{weekError}</div>
          ) : loadingWeek ? (
            <WeeklySkeleton />
          ) : (
            <div className="overflow-x-auto">
              <div
                className="grid gap-2 min-w-[980px]"
                style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
              >
                {weekDays.map((d) => (
                  <WeekDayCard
                    key={d.dateStr}
                    data={d}
                    onOpenDay={() => {
                      setSelectedDate(
                        new Date(
                          d.date.getFullYear(),
                          d.date.getMonth(),
                          d.date.getDate(),
                          0,
                          0,
                          0,
                          0
                        )
                      );
                      setViewMode("daily");
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}
      {selectedOverbooking && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Overbooking
                </p>
                <p className="text-sm font-semibold text-slate-100">
                  {selectedOverbooking.professionalName} ·{" "}
                  {selectedOverbooking.slotTime}
                </p>
                <p className="text-[11px] text-slate-400">
                  {selectedOverbooking.appointments.length} agendamentos neste
                  horário
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={
                    !canOverbookSlot(
                      selectedOverbooking.professionalId,
                      selectedOverbooking.slotTime
                    )
                  }
                  className="px-3 py-1 rounded-lg border border-amber-400 bg-amber-500/10 text-[11px] text-amber-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => {
                    // abre o modal de criar no mesmo horário/profissional (encaixe)
                    handleCloseOverbookingModal();
                    handleCreateAppointmentClick({
                      time: selectedOverbooking.slotTime,
                      professionalId: selectedOverbooking.professionalId,
                      professionalName: selectedOverbooking.professionalName,
                    });
                  }}
                >
                  + Novo encaixe
                </button>

                <button
                  className="text-[11px] text-slate-400 hover:text-slate-100"
                  onClick={handleCloseOverbookingModal}
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {selectedOverbooking.appointments.map((a) => {
                const st = getStatusClasses(a.status);

                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handlePickOverbookingAppointment(a)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/30 px-3 py-2 text-left hover:border-emerald-500/60 hover:bg-slate-900/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-400">{a.time}</p>
                        <p className="text-[12px] font-medium text-slate-100 truncate">
                          {a.serviceName}
                        </p>
                        <p className="text-[10px] text-slate-300 truncate">
                          Cliente: {a.customerName}
                        </p>
                      </div>

                      <span
                        className={`text-[9px] px-2 py-[2px] rounded ${st.badge}`}
                      >
                        {st.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-[10px] text-slate-500">
              Clique em um agendamento para abrir os detalhes.
            </p>
          </div>
        </div>
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
                  {overbookingEnabled && (
                    <button
                      type="button"
                      disabled={
                        !canOverbookSlot(
                          selectedAppointment.professionalId,
                          selectedAppointment.time
                        )
                      }
                      className="w-full px-3 py-1 rounded-lg border border-amber-400 bg-amber-500/10 text-[11px] text-amber-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() =>
                        handleCreateOverbookingFromAppointment(
                          selectedAppointment
                        )
                      }
                    >
                      + Encaixar outro cliente neste horário
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
              {isOverbookingNow && (
                <div className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
                  Atenção: já existe {overbookingCount} agendamento(s) neste
                  horário. Ao salvar, ficará {overbookingCount + 1}.
                </div>
              )}
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

function minutesToTimeStr(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getApptDurationMin(appt: AgendaAppointment, fallback: number) {
  const d =
    (appt as any).serviceDurationMin ??
    (appt as any).durationMin ??
    (appt as any).service?.durationMin ??
    fallback;

  const v = Number(d);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function getApptStartMin(appt: AgendaAppointment) {
  return timeStrToMinutes(appt.time);
}

function getStatusLabel(status: AgendaAppointment["status"]) {
  const s = getStatusClasses(status);
  return s.label;
}

function ProfessionalTimeline({
  pro,
  periodLabel,
  periodStart,
  periodEnd,
  stepMin,
  bufferMin,
  appointments,
  onCreateAppointment,
  onOpenDetails,
  onOpenOverbooking,
  isPastDay,
  isToday,
  nowMinutes,
}: {
  pro: AgendaProfessional;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  stepMin: number;
  bufferMin: number;
  appointments: AgendaAppointment[];
  onCreateAppointment?: (params: {
    time: string;
    professionalId: string;
    professionalName: string;
  }) => void;
  onOpenDetails?: (appointment: AgendaAppointment) => void;

  // ✅ NOVO (opcional): abrir lista quando tiver overbooking
  onOpenOverbooking?: (params: {
    slotTime: string;
    professionalId: string;
    professionalName: string;
    appointments: AgendaAppointment[];
  }) => void;

  isPastDay: boolean;
  isToday: boolean;
  nowMinutes: number;
}) {
  const rowPx = 56;

  const startMin = timeStrToMinutes(periodStart);
  const lastStartMin = timeStrToMinutes(periodEnd);

  const proGroups = useMemo(() => {
    const list = appointments
      .filter((a) => a.professionalId === pro.id && a.status !== "cancelled")
      .map((a) => {
        const sMin = getApptStartMin(a);
        const dur = getApptDurationMin(a, stepMin);
        const eMin = sMin + dur;
        return { appt: a, startMin: sMin, endMin: eMin, durMin: dur };
      })
      .sort((a, b) => a.startMin - b.startMin);

    // agrupa por startMin (overbooking)
    const groupsMap = new Map<number, typeof list>();

    for (const item of list) {
      const arr = groupsMap.get(item.startMin) ?? [];
      arr.push(item);
      groupsMap.set(item.startMin, arr);
    }

    return Array.from(groupsMap.entries())
      .map(([startMinKey, items]) => {
        const maxEndMin = Math.max(...items.map((x) => x.endMin));
        const maxDurMin = Math.max(...items.map((x) => x.durMin));
        return {
          startMin: startMinKey,
          items,
          maxEndMin,
          maxDurMin,
        };
      })
      .sort((a, b) => a.startMin - b.startMin);
  }, [appointments, pro.id, stepMin]);

  const items: React.ReactNode[] = [];

  let cursor = startMin;
  let guard = 0;

  while (cursor <= lastStartMin && guard < 2000) {
    guard++;

    const nextGroup = proGroups.find((g) => g.startMin >= cursor);

    // ✅ se não tem mais appt, desenha slots até o fim
    if (!nextGroup) {
      while (cursor <= lastStartMin && guard < 2000) {
        guard++;

        const slotTime = minutesToTimeStr(cursor);
        const slotEnd = cursor + stepMin;

        const isPastSlot = isPastDay || (isToday && slotEnd <= nowMinutes);

        if (isPastSlot) {
          items.push(
            <div
              key={`past-${pro.id}-${cursor}`}
              className="rounded-xl border border-slate-900/60 bg-slate-950/40 opacity-40 cursor-not-allowed flex items-center justify-between px-2"
              style={{ height: rowPx }}
              title={`${periodLabel} · ${slotTime}`}
            >
              <span className="text-[10px] text-slate-500">{slotTime}</span>
            </div>
          );
        } else {
          items.push(
            <button
              key={`free-${pro.id}-${cursor}`}
              type="button"
              className="rounded-xl border border-slate-800/50 bg-slate-950/30 hover:border-emerald-500/60 hover:bg-slate-900/60 transition-colors text-left flex items-center justify-between px-2"
              style={{ height: rowPx }}
              onClick={() =>
                onCreateAppointment?.({
                  time: slotTime,
                  professionalId: pro.id,
                  professionalName: pro.name,
                })
              }
              title={`${periodLabel} · ${slotTime}`}
            >
              <span className="text-[10px] text-slate-500">{slotTime}</span>
            </button>
          );
        }

        cursor += stepMin;
      }

      break;
    }

    // ✅ 1) slots livres até começar o próximo grupo
    while (cursor + stepMin <= nextGroup.startMin && cursor <= lastStartMin) {
      const slotTime = minutesToTimeStr(cursor);
      const slotEnd = cursor + stepMin;

      const isPastSlot = isPastDay || (isToday && slotEnd <= nowMinutes);

      if (isPastSlot) {
        items.push(
          <div
            key={`past-${pro.id}-${cursor}`}
            className="rounded-xl border border-slate-900/60 bg-slate-950/40 opacity-40 cursor-not-allowed flex items-center justify-between px-2"
            style={{ height: rowPx }}
            title={`${periodLabel} · ${slotTime}`}
          >
            <span className="text-[10px] text-slate-500">{slotTime}</span>
          </div>
        );
      } else {
        items.push(
          <button
            key={`free-${pro.id}-${cursor}`}
            type="button"
            className="rounded-xl border border-slate-800/50 bg-slate-950/30 hover:border-emerald-500/60 hover:bg-slate-900/60 transition-colors text-left flex items-center justify-between px-2"
            style={{ height: rowPx }}
            onClick={() =>
              onCreateAppointment?.({
                time: slotTime,
                professionalId: pro.id,
                professionalName: pro.name,
              })
            }
            title={`${periodLabel} · ${slotTime}`}
          >
            <span className="text-[10px] text-slate-500">{slotTime}</span>
          </button>
        );
      }

      cursor += stepMin;
    }

    if (cursor > lastStartMin) break;

    // ✅ 2) renderiza o bloco (normal OU overbooking)
    const apptHeightPx = Math.max(
      rowPx,
      (nextGroup.maxDurMin / stepMin) * rowPx
    );

    if (nextGroup.items.length === 1) {
      const one = nextGroup.items[0];
      const statusStyles = getStatusClasses(one.appt.status);
      const billingType = (one.appt as any).billingType as
        | "plan"
        | "single"
        | undefined;

      items.push(
        <button
          key={`appt-${one.appt.id}`}
          type="button"
          className={`w-full rounded-xl border px-2 py-2 text-left ${statusStyles.container}`}
          style={{ height: apptHeightPx }}
          onClick={() => onOpenDetails?.(one.appt)}
          title={`${one.appt.time} · ${one.appt.serviceName} · ${
            one.appt.customerName
          } · ${getStatusLabel(one.appt.status)}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] text-slate-300">{one.appt.time}</p>
              <p className="text-[12px] font-medium truncate">
                {one.appt.serviceName}
              </p>
              <p className="text-[10px] text-slate-300 truncate">
                Cliente: {one.appt.customerName}
              </p>
            </div>

            <div className="flex flex-col items-end gap-1">
              <span className={`text-[9px] px-1 rounded ${statusStyles.badge}`}>
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
          </div>
        </button>
      );
    } else {
      const count = nextGroup.items.length;
      const slotTime = minutesToTimeStr(nextGroup.startMin);

      items.push(
        <button
          key={`overbook-${pro.id}-${nextGroup.startMin}`}
          type="button"
          className="w-full rounded-xl border px-2 py-2 text-left border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 transition-colors"
          style={{ height: apptHeightPx }}
          onClick={() => {
            // ✅ se tiver handler de overbooking, usa ele
            if (onOpenOverbooking) {
              onOpenOverbooking({
                slotTime,
                professionalId: pro.id,
                professionalName: pro.name,
                appointments: nextGroup.items.map((x) => x.appt),
              });
              return;
            }

            // fallback: abre o primeiro
            onOpenDetails?.(nextGroup.items[0].appt);
          }}
          title={`${slotTime} · Overbooking (${count} agendamentos)`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] text-slate-300">{slotTime}</p>
              <p className="text-[12px] font-medium truncate">Overbooking</p>
              <p className="text-[10px] text-slate-300 truncate">
                {count} agendamentos neste horário
              </p>
            </div>

            <span className="text-[9px] px-2 py-[2px] rounded border border-amber-400/60 bg-amber-500/20 text-amber-100">
              +{count - 1}
            </span>
          </div>
        </button>
      );
    }

    // ✅ 3) buffer visual + shift real
    if (bufferMin > 0) {
      const bufferHeightPx = Math.max(16, (bufferMin / stepMin) * rowPx);

      items.push(
        <div
          key={`buffer-${pro.id}-${nextGroup.startMin}`}
          className="rounded-xl border border-slate-800/40 bg-slate-900/30 flex items-center justify-center text-[10px] text-slate-500"
          style={{ height: bufferHeightPx }}
          title={`Buffer ${bufferMin} min`}
        >
          Buffer · {bufferMin}m
        </div>
      );
    }

    cursor = nextGroup.maxEndMin + bufferMin;
  }

  return <div className="flex flex-col gap-2">{items}</div>;
}

function WeeklySkeleton() {
  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-2 min-w-[980px]"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-[170px] rounded-2xl border border-slate-800 bg-slate-950/40 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

function WeekDayCard({
  data,
  onOpenDay,
}: {
  data: WeekDayData;
  onOpenDay: () => void;
}) {
  const s = data.stats;

  return (
    <div
      className={`rounded-2xl border bg-slate-950/30 p-3 ${
        data.isToday
          ? "border-emerald-500/50 bg-emerald-500/5"
          : "border-slate-800"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">
            {data.dayLabel}
          </p>
          <p className="text-lg font-semibold text-slate-50 leading-tight">
            {s.total}
            <span className="ml-1 text-[11px] font-normal text-slate-400">
              agend.
            </span>
          </p>
        </div>

        <button
          type="button"
          className="shrink-0 px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/70 text-[11px] text-slate-200 hover:bg-slate-900"
          onClick={onOpenDay}
        >
          Abrir
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] mb-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-2">
          <p className="text-slate-500">Plano</p>
          <p className="text-emerald-300 font-semibold">{s.planCount}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-2">
          <p className="text-slate-500">Avulso</p>
          <p className="text-slate-100 font-semibold">{s.avulsoCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 text-[10px] mb-2">
        <span className="px-2 py-0.5 rounded border border-sky-500/30 bg-sky-500/10 text-sky-100">
          Agendamentos: {s.scheduled}
        </span>
        <span className="px-2 py-0.5 rounded border border-slate-600/30 bg-slate-700/20 text-slate-100">
          Concluídos: {s.done}
        </span>
        <span className="px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-100">
          Faltas: {s.noShow}
        </span>
        <span className="px-2 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-100">
          Cancelados: {s.cancelled}
        </span>
      </div>

      <div className="mt-2">
        <p className="text-[11px] text-slate-500 mb-1">Agendamentos</p>

        {data.items.length === 0 ? (
          <div className="text-[11px] text-slate-500">
            Nenhum agendamento neste dia.
          </div>
        ) : (
          <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
            {data.items.map((t) => {
              const status = getWeeklyStatusBadge(t.status);

              return (
                <div
                  key={t.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/30 px-2 py-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-200 truncate">
                      <span className="text-slate-400">{t.time}</span> ·{" "}
                      {t.serviceName}
                    </p>

                    <span
                      className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded border ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-400 truncate">
                    {t.customerName} ·{" "}
                    {t.billingType === "plan" ? "Plano" : "Avulso"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0
  );

  const day = d.getDay(); // 0=Dom, 1=Seg...
  const diff = day === 0 ? -6 : 1 - day; // volta até segunda
  return addDays(d, diff);
}

function getWeekRangeLabel(anchor: Date): string {
  const start = startOfWeekMonday(anchor);
  const end = addDays(start, 6);

  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();

  const startLabel = start.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
  });

  const endLabel = end.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });

  if (sameMonth) {
    return `Semana · ${start.getDate()}–${endLabel}`;
  }

  return `Semana · ${startLabel} – ${endLabel}`;
}
function getWeeklyStatusBadge(status: AgendaAppointment["status"]) {
  switch (status) {
    case "done":
      return {
        label: "Concluído",
        className: "border-slate-600/40 bg-slate-700/20 text-slate-100",
      };
    case "no_show":
      return {
        label: "Falta",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-100",
      };
    case "cancelled":
      return {
        label: "Cancelado",
        className: "border-rose-500/30 bg-rose-500/10 text-rose-100",
      };
    case "in_service":
      // pode acontecer em dia atual, mas não damos destaque no semanal
      return {
        label: "Em atendimento",
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
      };
    default:
      return {
        label: "Agendado",
        className: "border-sky-500/30 bg-sky-500/10 text-sky-100",
      };
  }
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
