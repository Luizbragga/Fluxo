"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchOwnerPlans,
  OwnerPlansData,
  PlanCustomer,
  createOwnerPlanTemplate,
  fetchOwnerServices,
  OwnerService,
  payOwnerCustomerPlan,
  createOwnerCustomerPlan,
  updateOwnerPlanTemplate,
} from "../_api/owner-plans";

import {
  fetchOwnerLocations,
  type OwnerLocation,
} from "../_api/owner-services";

type PaymentActionState = "noData" | "canPay" | "alreadyAdvanced" | "tooEarly";

function getPaymentActionState(
  customer: PlanCustomer,
  advanceDays: number
): PaymentActionState {
  if (!customer.nextChargeDate) return "noData";

  const nextDate = new Date(customer.nextChargeDate);
  if (Number.isNaN(nextDate.getTime())) return "noData";

  const now = new Date();

  // janela para adiantar pagamento (ex.: 5 dias antes do fim do ciclo)
  const windowStart = new Date(nextDate);
  windowStart.setDate(windowStart.getDate() - advanceDays);

  // se já estamos dentro da janela -> pode pagar próximo mês
  if (now >= windowStart) {
    return "canPay";
  }

  // se ainda não está na janela, vemos se o ciclo atual já foi pago adiantado
  // (ou seja, o pagamento foi feito ANTES do início do ciclo atual)
  if (customer.lastPaymentAt) {
    const lastPaid = new Date(customer.lastPaymentAt);
    const currentStart = new Date(customer.startedAt);

    if (
      !Number.isNaN(lastPaid.getTime()) &&
      !Number.isNaN(currentStart.getTime()) &&
      lastPaid < currentStart
    ) {
      return "alreadyAdvanced"; // próximo mês já está pago
    }
  }

  // aqui é “não dá pra pagar ainda, mas também não está adiantado”
  return "tooEarly";
}

type FilterStatus = "all" | "active" | "inactive";
function minutesToTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function OwnerPlanosPage() {
  const searchParams = useSearchParams();
  const ADVANCE_PAYMENT_DAYS = 5; // quantos dias antes do fim do ciclo pode adiantar o próximo mês
  const initialLocationId = searchParams.get("locationId") ?? undefined;

  // location selecionada para a tela inteira
  const [selectedLocationId, setSelectedLocationId] = useState<
    string | undefined
  >(initialLocationId);

  const [registeringPaymentId, setRegisteringPaymentId] = useState<
    string | null
  >(null);

  // locations disponíveis
  const [locations, setLocations] = useState<OwnerLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);

  // planos / stats / clientes
  const [data, setData] = useState<OwnerPlansData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  // criação de plano
  const [isCreating, setIsCreating] = useState(false);
  const [creatingLoading, setCreatingLoading] = useState(false);
  const [creatingError, setCreatingError] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPrice, setFormPrice] = useState("0");
  const [formVisits, setFormVisits] = useState("2"); // visitas por mês
  const [formMinDaysBetween, setFormMinDaysBetween] = useState("");
  // edição de plano selecionado
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editVisits, setEditVisits] = useState("");
  const [editMinDaysBetween, setEditMinDaysBetween] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editAllowedWeekdays, setEditAllowedWeekdays] = useState<number[]>([]);

  // criação de cliente no plano selecionado
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [createCustomerLoading, setCreateCustomerLoading] = useState(false);
  const [createCustomerError, setCreateCustomerError] = useState<string | null>(
    null
  );

  // novas regras
  const [formStartTime, setFormStartTime] = useState(""); // ex: "15:00"
  const [formEndTime, setFormEndTime] = useState(""); // ex: "18:00"
  const [formAllowedWeekdays, setFormAllowedWeekdays] = useState<number[]>([]);

  // serviços e desconto
  const [services, setServices] = useState<OwnerService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [applyDiscount, setApplyDiscount] = useState(false);
  const [discountPercent, setDiscountPercent] = useState<5 | 10 | 15>(10);

  const [priceAuto, setPriceAuto] = useState(true);
  const [isServicePickerOpen, setIsServicePickerOpen] = useState(false);

  const WEEKDAYS = [
    { value: 1, label: "Seg" },
    { value: 2, label: "Ter" },
    { value: 3, label: "Qua" },
    { value: 4, label: "Qui" },
    { value: 5, label: "Sex" },
    { value: 6, label: "Sáb" },
    { value: 0, label: "Dom" },
  ];
  const WEEKDAY_LABEL_MAP: Record<number, string> = WEEKDAYS.reduce(
    (acc, day) => {
      acc[day.value] = day.label;
      return acc;
    },
    {} as Record<number, string>
  );

  // ---------------------------------------------------------------------------
  // Carregar locations (lista de unidades)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadLocations() {
      setLocationsLoading(true);
      setLocationsError(null);
      try {
        const locs = await fetchOwnerLocations();
        if (cancelled) return;

        setLocations(locs);

        if (locs.length > 0) {
          setSelectedLocationId(
            (prev) => prev || initialLocationId || locs[0].id
          );
        }
      } catch (err: any) {
        if (!cancelled) {
          setLocationsError(
            err?.message ?? "Erro ao carregar unidades (locations)."
          );
        }
      } finally {
        if (!cancelled) setLocationsLoading(false);
      }
    }

    loadLocations();
    return () => {
      cancelled = true;
    };
  }, [initialLocationId]);

  // sempre que mudar de unidade, limpamos os serviços selecionados
  useEffect(() => {
    setSelectedServiceIds([]);
  }, [selectedLocationId]);

  // ---------------------------------------------------------------------------
  // Carrega planos (filtrando pela unidade selecionada, se houver)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchOwnerPlans({
          locationId: selectedLocationId,
        });

        if (!cancelled) {
          setData(result);
          setSelectedId((prev) =>
            prev && result.planTemplates.some((p) => p.id === prev)
              ? prev
              : result.planTemplates[0]?.id ?? null
          );
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Erro ao carregar planos.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedLocationId]);

  // ---------------------------------------------------------------------------
  // Carrega serviços da unidade selecionada (para montar o plano)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    if (!selectedLocationId) {
      setServices([]);
      return;
    }

    async function loadServices() {
      setServicesLoading(true);
      setServicesError(null);
      try {
        const result = await fetchOwnerServices({
          locationId: selectedLocationId,
        });
        if (!cancelled) {
          setServices(result);
        }
      } catch (err: any) {
        if (!cancelled) {
          setServicesError(
            err?.message ?? "Erro ao carregar serviços para montagem do plano."
          );
        }
      } finally {
        if (!cancelled) setServicesLoading(false);
      }
    }

    loadServices();
    return () => {
      cancelled = true;
    };
  }, [selectedLocationId]);

  // ---------------------------------------------------------------------------
  // Cálculo automático do preço (serviços × visitas × desconto)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!priceAuto) return;

    const visitsNumber = Number(formVisits) || 0;
    if (visitsNumber <= 0) return;

    const selectedServices = services.filter((s) =>
      selectedServiceIds.includes(s.id)
    );
    if (selectedServices.length === 0) return;

    const basePerVisit = selectedServices.reduce(
      (sum, s) => sum + s.priceEuro,
      0
    );

    let raw = basePerVisit * visitsNumber;

    if (applyDiscount && raw > 0) {
      raw = raw * (1 - discountPercent / 100);
    }

    if (raw > 0) {
      setFormPrice(raw.toFixed(2));
    }
  }, [
    priceAuto,
    services,
    selectedServiceIds,
    formVisits,
    applyDiscount,
    discountPercent,
  ]);
  // sempre que trocar de plano selecionado, sai do modo edição
  useEffect(() => {
    setIsEditingPlan(false);
    setEditError(null);
  }, [selectedId]);

  // ---------------------------------------------------------------------------
  // Derivados para exibição (sugestão)
  // ---------------------------------------------------------------------------
  const selectedServicesForDisplay = services.filter((s) =>
    selectedServiceIds.includes(s.id)
  );
  const basePerVisit = selectedServicesForDisplay.reduce(
    (sum, s) => sum + s.priceEuro,
    0
  );
  const visitsNumberForCalc = Number(formVisits) || 0;
  const rawSuggested = basePerVisit * visitsNumberForCalc;
  const discountedSuggested =
    applyDiscount && rawSuggested > 0
      ? rawSuggested * (1 - discountPercent / 100)
      : rawSuggested;
  const suggestedPriceDisplay =
    discountedSuggested > 0 ? discountedSuggested.toFixed(2) : null;

  // ---------------------------------------------------------------------------
  // Submit: criar plano
  // ---------------------------------------------------------------------------
  async function handleCreatePlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedLocationId) {
      setCreatingError(
        "Para criar um plano, seleciona primeiro uma unidade (location)."
      );
      return;
    }

    try {
      setCreatingLoading(true);
      setCreatingError(null);

      const name = formName.trim();
      const description = formDescription.trim() || undefined;

      if (!name) {
        throw new Error("Nome do plano é obrigatório.");
      }

      const priceNumber = Number(formPrice.toString().replace(",", "."));
      if (!priceNumber || priceNumber <= 0) {
        throw new Error("Preço deve ser maior que zero.");
      }

      const visitsNumber = Number(formVisits);
      if (!visitsNumber || visitsNumber <= 0) {
        throw new Error("Número de visitas por mês deve ser maior que zero.");
      }

      if (selectedServiceIds.length === 0) {
        throw new Error("Seleciona pelo menos um serviço para este plano.");
      }

      const minDaysBetweenNumber = formMinDaysBetween
        ? Number(formMinDaysBetween)
        : undefined;

      if (
        formMinDaysBetween &&
        (!minDaysBetweenNumber || minDaysBetweenNumber <= 0)
      ) {
        throw new Error(
          "Intervalo mínimo entre visitas deve ser um número maior que zero."
        );
      }

      // ------- Horário opcional -------
      const parseTime = (value: string): number | null => {
        if (!value) return null;
        const [hhStr, mmStr] = value.split(":");
        const hh = Number(hhStr);
        const mm = Number(mmStr);
        if (
          Number.isNaN(hh) ||
          Number.isNaN(mm) ||
          hh < 0 ||
          hh > 23 ||
          mm < 0 ||
          mm > 59
        ) {
          return null;
        }
        return hh * 60 + mm;
      };

      const startMinutes = parseTime(formStartTime);
      const endMinutes = parseTime(formEndTime);

      if (formStartTime && startMinutes == null) {
        throw new Error("Horário inicial inválido. Use o formato HH:MM.");
      }
      if (formEndTime && endMinutes == null) {
        throw new Error("Horário final inválido. Use o formato HH:MM.");
      }
      if (
        startMinutes != null &&
        endMinutes != null &&
        endMinutes <= startMinutes
      ) {
        throw new Error("Horário final deve ser maior que o horário inicial.");
      }

      // ------- Chamada correta para criar o plano -------
      const created = await createOwnerPlanTemplate({
        locationId: selectedLocationId,
        name,
        description,
        priceEuro: priceNumber,
        intervalDays: 30, // ciclo mensal fixo
        visitsPerInterval: visitsNumber,
        sameDayServiceIds: selectedServiceIds,
        minDaysBetweenVisits: minDaysBetweenNumber,
        allowedWeekdays:
          formAllowedWeekdays.length > 0 ? formAllowedWeekdays : undefined,
        allowedStartTimeMinutes: startMinutes ?? undefined,
        allowedEndTimeMinutes: endMinutes ?? undefined,
      });

      // limpa campos de horário/dias
      setFormStartTime("");
      setFormEndTime("");
      setFormAllowedWeekdays([]);

      // Atualiza estado local com o novo plano
      setData((prev) => {
        if (!prev) return prev;

        const newPlanTemplates = [...prev.planTemplates, created].sort((a, b) =>
          a.name.localeCompare(b.name)
        );

        const newPlanStats = [
          ...prev.planStats,
          {
            planId: created.id,
            activeCustomers: 0,
            totalRevenueMonth: 0,
            churnRatePercent: 0,
          },
        ];

        const newPlanCustomersByPlan = {
          ...prev.planCustomersByPlan,
          [created.id]: [],
        };

        return {
          planTemplates: newPlanTemplates,
          planStats: newPlanStats,
          planCustomersByPlan: newPlanCustomersByPlan,
        };
      });

      setSelectedId(created.id);

      // limpa form
      setFormName("");
      setFormDescription("");
      setFormPrice("0");
      setFormVisits("2");
      setFormMinDaysBetween("");
      setSelectedServiceIds([]);
      setApplyDiscount(false);
      setDiscountPercent(10);
      setPriceAuto(true);
      setIsCreating(false);
    } catch (err: any) {
      console.error(err);
      setCreatingError(err?.message ?? "Erro ao criar plano.");
    } finally {
      setCreatingLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Registrar pagamento de um plano de cliente
  // ---------------------------------------------------------------------------
  const selectedPlan =
    selectedId && data
      ? data.planTemplates.find((p) => p.id === selectedId) ?? null
      : null;
  function handleStartEditPlan() {
    if (!selectedPlan) return;

    setEditName(selectedPlan.name);
    setEditDescription(selectedPlan.description ?? "");
    setEditPrice(selectedPlan.price.toFixed(2));
    setEditVisits(String(selectedPlan.visitsIncluded));
    setEditMinDaysBetween(
      selectedPlan.minDaysBetweenVisits != null
        ? String(selectedPlan.minDaysBetweenVisits)
        : ""
    );
    setEditAllowedWeekdays(selectedPlan.allowedWeekdays ?? []);

    setEditStartTime(
      selectedPlan.allowedStartTimeMinutes != null
        ? minutesToTimeLabel(selectedPlan.allowedStartTimeMinutes)
        : ""
    );
    setEditEndTime(
      selectedPlan.allowedEndTimeMinutes != null
        ? minutesToTimeLabel(selectedPlan.allowedEndTimeMinutes)
        : ""
    );

    setEditError(null);
    setIsEditingPlan(true);
  }

  async function handleRegisterPayment(customer: PlanCustomer) {
    if (!selectedPlan || !selectedLocationId) {
      // sem plano selecionado ou unidade, não faz sentido registrar pagamento
      return;
    }

    const actionState = getPaymentActionState(customer, ADVANCE_PAYMENT_DAYS);

    // segurança extra: só registra pagamento se estiver na janela certa
    if (actionState !== "canPay") {
      return;
    }

    const confirmMsg = `Registrar pagamento de € ${selectedPlan.price.toFixed(
      2
    )} para ${customer.name}?`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      setRegisteringPaymentId(customer.id);
      setError(null);

      // 1) Chama backend para marcar pagamento e girar ciclo
      await payOwnerCustomerPlan({
        customerPlanId: customer.id,
        amountEuro: selectedPlan.price,
      });

      // 2) Recarrega planos + clientes da unidade atual
      const result = await fetchOwnerPlans({
        locationId: selectedLocationId,
      });
      setData(result);
    } catch (err: any) {
      console.error(err);
      setError(
        err?.message ?? "Erro ao registrar pagamento do plano deste cliente."
      );
    } finally {
      setRegisteringPaymentId(null);
    }
  }

  async function handleCreateCustomer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedLocationId) {
      setCreateCustomerError(
        "Seleciona uma unidade antes de adicionar clientes ao plano."
      );
      return;
    }

    if (!selectedPlan) {
      setCreateCustomerError(
        "Seleciona primeiro um plano para adicionar clientes."
      );
      return;
    }

    try {
      setCreateCustomerLoading(true);
      setCreateCustomerError(null);

      const name = newCustomerName.trim();
      const phone = newCustomerPhone.trim();

      if (!name) {
        throw new Error("Nome do cliente é obrigatório.");
      }

      // chama o backend para criar o CustomerPlan
      await createOwnerCustomerPlan({
        planTemplateId: selectedPlan.id,
        customerName: name,
        customerPhone: phone || undefined,
      });

      // depois refaz o fetch dos planos para atualizar stats + lista de clientes
      const updated = await fetchOwnerPlans({
        locationId: selectedLocationId,
      });

      setData(updated);
      setSelectedId(selectedPlan.id); // garante que continua no mesmo plano

      // limpa form
      setNewCustomerName("");
      setNewCustomerPhone("");
      setIsCreatingCustomer(false);
    } catch (err: any) {
      console.error(err);
      setCreateCustomerError(
        err?.message ?? "Erro ao adicionar cliente ao plano."
      );
    } finally {
      setCreateCustomerLoading(false);
    }
  }
  async function handleUpdatePlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedPlan) return;

    try {
      setEditLoading(true);
      setEditError(null);

      const name = editName.trim();
      if (!name) {
        throw new Error("Nome do plano é obrigatório.");
      }

      const priceNumber = Number(editPrice.toString().replace(",", "."));
      if (!priceNumber || priceNumber <= 0) {
        throw new Error("Preço deve ser maior que zero.");
      }

      const visitsNumber = Number(editVisits);
      if (!visitsNumber || visitsNumber <= 0) {
        throw new Error("Número de visitas por mês deve ser maior que zero.");
      }

      const minDaysBetweenNumber = editMinDaysBetween
        ? Number(editMinDaysBetween)
        : undefined;
      if (
        editMinDaysBetween &&
        (!minDaysBetweenNumber || minDaysBetweenNumber <= 0)
      ) {
        throw new Error(
          "Intervalo mínimo entre visitas deve ser um número maior que zero."
        );
      }

      const parseTime = (value: string): number | null => {
        if (!value) return null;
        const [hhStr, mmStr] = value.split(":");
        const hh = Number(hhStr);
        const mm = Number(mmStr);
        if (
          Number.isNaN(hh) ||
          Number.isNaN(mm) ||
          hh < 0 ||
          hh > 23 ||
          mm < 0 ||
          mm > 59
        ) {
          return null;
        }
        return hh * 60 + mm;
      };

      const startMinutes = parseTime(editStartTime);
      const endMinutes = parseTime(editEndTime);

      if (editStartTime && startMinutes == null) {
        throw new Error("Horário inicial inválido. Use o formato HH:MM.");
      }
      if (editEndTime && endMinutes == null) {
        throw new Error("Horário final inválido. Use o formato HH:MM.");
      }
      if (
        startMinutes != null &&
        endMinutes != null &&
        endMinutes <= startMinutes
      ) {
        throw new Error("Horário final deve ser maior que o horário inicial.");
      }

      await updateOwnerPlanTemplate({
        id: selectedPlan.id,
        name,
        description: editDescription.trim() || undefined,
        priceEuro: priceNumber,
        visitsPerInterval: visitsNumber,
        minDaysBetweenVisits: minDaysBetweenNumber,
        allowedWeekdays:
          editAllowedWeekdays.length > 0 ? editAllowedWeekdays : undefined,
        allowedStartTimeMinutes: startMinutes ?? undefined,
        allowedEndTimeMinutes: endMinutes ?? undefined,
      });

      // recarrega tudo pra atualizar stats, clientes etc.
      const refreshed = await fetchOwnerPlans({
        locationId: selectedLocationId,
      });
      setData(refreshed);
      setSelectedId(selectedPlan.id);
      setIsEditingPlan(false);
    } catch (err: any) {
      console.error(err);
      setEditError(err?.message ?? "Erro ao atualizar plano.");
    } finally {
      setEditLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Estados globais de loading/erro
  // ---------------------------------------------------------------------------
  if (loading && !data) {
    return (
      <div className="p-4 text-xs text-slate-400">
        Carregando planos de assinatura...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-xs text-rose-300">
        Erro ao carregar planos: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-xs text-slate-400">
        Nenhum dado de planos disponível.
      </div>
    );
  }

  const { planTemplates, planStats, planCustomersByPlan } = data;

  const filteredPlanTemplates = planTemplates.filter((plan) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "active") return plan.isActive;
    return !plan.isActive; // "inactive"
  });

  const selectedStats = selectedId
    ? planStats.find((s) => s.planId === selectedId)
    : undefined;

  const customers: PlanCustomer[] = selectedId
    ? planCustomersByPlan[selectedId] ?? []
    : [];

  // textos derivados para mostrar as regras do plano selecionado
  let selectedPlanWeekdaysLabel = "";
  let selectedPlanTimeWindowLabel = "";

  if (selectedPlan) {
    const sp: any = selectedPlan;

    // dias permitidos
    const days: number[] | undefined = sp.allowedWeekdays;
    if (days && days.length > 0) {
      selectedPlanWeekdaysLabel = days
        .slice()
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_LABEL_MAP[d] ?? String(d))
        .join(", ");
    } else {
      selectedPlanWeekdaysLabel = "Qualquer dia da semana";
    }

    // função pra formatar minutos -> HH:MM
    const formatTime = (minutes: number) => {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    };

    const start: number | undefined = sp.allowedStartTimeMinutes;
    const end: number | undefined = sp.allowedEndTimeMinutes;

    if (start == null && end == null) {
      selectedPlanTimeWindowLabel = "Qualquer horário de funcionamento";
    } else if (start != null && end != null) {
      selectedPlanTimeWindowLabel = `${formatTime(start)} — ${formatTime(end)}`;
    } else if (start != null) {
      selectedPlanTimeWindowLabel = `A partir de ${formatTime(start)}`;
    } else if (end != null) {
      selectedPlanTimeWindowLabel = `Até ${formatTime(end)}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      {/* Cabeçalho */}
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Planos</h1>
          <p className="text-xs text-slate-400">
            Gestão de planos de assinatura, clientes recorrentes e receitas.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button
            onClick={() => setFilterStatus("all")}
            className={[
              "px-3 py-1 rounded-lg border",
              filterStatus === "all"
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                : "border-slate-800 bg-slate-900/80 text-slate-200 hover:border-slate-700",
            ].join(" ")}
          >
            Todos
          </button>

          <button
            onClick={() => setFilterStatus("active")}
            className={[
              "px-3 py-1 rounded-lg border",
              filterStatus === "active"
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                : "border-slate-800 bg-slate-900/80 text-slate-200 hover:border-slate-700",
            ].join(" ")}
          >
            Ativos
          </button>

          <button
            onClick={() => setFilterStatus("inactive")}
            className={[
              "px-3 py-1 rounded-lg border",
              filterStatus === "inactive"
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                : "border-slate-800 bg-slate-900/80 text-slate-200 hover:border-slate-700",
            ].join(" ")}
          >
            Inativos
          </button>

          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200"
          >
            + Criar plano
          </button>
        </div>
      </header>

      {/* Form de criação */}
      {isCreating && (
        <section className="mb-4 rounded-2xl border border-emerald-700/60 bg-slate-900/70 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold">Criar novo plano</p>
              <p className="text-[11px] text-slate-400">
                Define o nome, os serviços, o número de visitas por mês e o
                valor. Depois evoluímos para regras mais avançadas (horários,
                antecedência mínima, etc.).
              </p>
            </div>
            <button
              type="button"
              onClick={() => !creatingLoading && setIsCreating(false)}
              className="text-[11px] text-slate-300 hover:text-slate-100"
            >
              Cancelar
            </button>
          </div>

          {creatingError && (
            <p className="mb-2 text-[11px] text-rose-300">{creatingError}</p>
          )}

          {locationsError && (
            <p className="mb-2 text-[11px] text-rose-300">{locationsError}</p>
          )}

          {locations.length === 0 && !locationsLoading && (
            <p className="mb-2 text-[11px] text-amber-300">
              ⚠ Ainda não há nenhuma unidade (location) criada para este espaço.
              Cria primeiro as unidades no módulo de Locations para poder
              cadastrar planos vinculados.
            </p>
          )}

          <form
            onSubmit={handleCreatePlan}
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            {/* Coluna esquerda: unidade, nome, descrição, serviços */}
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-300">
                  Unidade (location)
                </label>
                {locationsLoading ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Carregando unidades...
                  </p>
                ) : locations.length === 0 ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Ainda não há unidades cadastradas.
                  </p>
                ) : (
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                    value={selectedLocationId ?? ""}
                    onChange={(e) =>
                      setSelectedLocationId(
                        e.target.value ? e.target.value : undefined
                      )
                    }
                  >
                    <option value="">Seleciona uma unidade...</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="text-[11px] text-slate-300">
                  Nome do plano
                </label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-300">Descrição</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-300">
                  Serviços incluídos no plano
                </label>

                {/* Resumo + botão abrir/fechar */}
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-500 truncate">
                    {selectedServiceIds.length === 0
                      ? "Nenhum serviço selecionado."
                      : `${selectedServiceIds.length} serviço(s) selecionado(s)`}
                  </p>

                  <button
                    type="button"
                    className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-100 hover:border-emerald-500 hover:text-emerald-200"
                    onClick={() => setIsServicePickerOpen((prev) => !prev)}
                  >
                    {isServicePickerOpen
                      ? "Fechar seleção"
                      : "Selecionar serviços"}
                  </button>
                </div>

                {/* Lista expandida de serviços */}
                {isServicePickerOpen && (
                  <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/80 p-2 max-h-40 overflow-y-auto">
                    {selectedLocationId == null && locations.length > 0 ? (
                      <p className="text-[11px] text-slate-500">
                        Seleciona uma unidade para ver os serviços disponíveis.
                      </p>
                    ) : servicesLoading ? (
                      <p className="text-[11px] text-slate-500">
                        Carregando serviços...
                      </p>
                    ) : servicesError ? (
                      <p className="text-[11px] text-rose-300">
                        {servicesError}
                      </p>
                    ) : services.length === 0 ? (
                      <p className="text-[11px] text-slate-500">
                        Ainda não há serviços cadastrados nesta unidade.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {services.map((service) => {
                          const checked = selectedServiceIds.includes(
                            service.id
                          );
                          return (
                            <button
                              key={service.id}
                              type="button"
                              onClick={() =>
                                setSelectedServiceIds((prev) =>
                                  checked
                                    ? prev.filter((id) => id !== service.id)
                                    : [...prev, service.id]
                                )
                              }
                              className={[
                                "rounded-full border px-3 py-1 text-[11px]",
                                checked
                                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                                  : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-500",
                              ].join(" ")}
                            >
                              {service.name} · € {service.priceEuro.toFixed(2)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Coluna direita: preço, visitas, regras, desconto */}
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] text-slate-300">
                    Preço final (€)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                    value={formPrice}
                    onChange={(e) => {
                      setFormPrice(e.target.value);
                      setPriceAuto(false); // passa a ser manual
                    }}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-300">
                    Visitas / mês
                  </label>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                    value={formVisits}
                    onChange={(e) => {
                      setFormVisits(e.target.value);
                      setPriceAuto(true); // muda parâmetro -> recalcula
                    }}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-300">
                    Intervalo mín. (dias)
                  </label>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                    placeholder="Opcional"
                    value={formMinDaysBetween}
                    onChange={(e) => setFormMinDaysBetween(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-1 flex items-center justify-between gap-2">
                {suggestedPriceDisplay ? (
                  <p className="text-[11px] text-slate-400">
                    Sugestão: € {suggestedPriceDisplay}{" "}
                    <span className="text-slate-500">
                      (serviços × visitas / mês
                      {applyDiscount ? ` · -${discountPercent}%` : ""})
                    </span>
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Seleciona pelo menos um serviço e nº de visitas para sugerir
                    valor.
                  </p>
                )}

                {suggestedPriceDisplay && (
                  <button
                    type="button"
                    className="text-[11px] text-emerald-400 hover:underline whitespace-nowrap"
                    onClick={() => {
                      setPriceAuto(true);
                      setFormPrice(suggestedPriceDisplay);
                    }}
                  >
                    Usar sugestão
                  </button>
                )}
              </div>

              <div className="mt-1 flex items-center gap-3">
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-slate-600 bg-slate-900"
                    checked={applyDiscount}
                    onChange={(e) => {
                      setApplyDiscount(e.target.checked);
                      setPriceAuto(true);
                    }}
                  />
                  Aplicar desconto
                </label>

                {applyDiscount && (
                  <select
                    className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                    value={discountPercent}
                    onChange={(e) =>
                      setDiscountPercent(Number(e.target.value) as 5 | 10 | 15)
                    }
                  >
                    <option value={5}>5%</option>
                    <option value={10}>10%</option>
                    <option value={15}>15%</option>
                  </select>
                )}
              </div>

              {/* Regras de horário e dias (opcionais) */}
              <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                <p className="text-[11px] text-slate-300">
                  Janela de horário & dias (opcional)
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400">
                      Hora inicial
                    </label>
                    <input
                      type="time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">
                      Hora final
                    </label>
                    <input
                      type="time"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-[10px] text-slate-400">
                    Dias permitidos (opcional)
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {WEEKDAYS.map((day) => {
                      const active = formAllowedWeekdays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() =>
                            setFormAllowedWeekdays((prev) =>
                              active
                                ? prev.filter((v) => v !== day.value)
                                : [...prev, day.value]
                            )
                          }
                          className={[
                            "rounded-full px-2 py-[3px] text-[10px] border",
                            active
                              ? "border-emerald-500 bg-emerald-500/15 text-emerald-100"
                              : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500",
                          ].join(" ")}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={creatingLoading || !selectedLocationId}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-[11px] font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {creatingLoading ? "Criando..." : "Salvar plano"}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* Grid principal: lista de planos + detalhe */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lista de planos */}
        <div className="lg:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Catálogo de planos</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Ver pagamentos
            </button>
          </div>

          <div className="mb-3">
            <input
              placeholder="Buscar por nome de plano..."
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-2">
            {filteredPlanTemplates.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                Nenhum plano encontrado para este filtro.
              </p>
            ) : (
              filteredPlanTemplates.map((plan) => {
                const isSelected = plan.id === selectedId;
                const stats = planStats.find((s) => s.planId === plan.id);

                return (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedId(plan.id)}
                    className={[
                      "w-full text-left rounded-xl border px-3 py-2 transition-colors",
                      isSelected
                        ? "border-emerald-500/60 bg-emerald-500/5"
                        : "border-slate-800 bg-slate-950/60 hover:border-slate-700",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-[13px]">{plan.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {plan.periodLabel} · {plan.visitsIncluded} visitas
                        </p>
                        <p className="text-[10px] text-slate-500">
                          € {plan.price} / mês
                        </p>
                      </div>
                      <div className="text-right">
                        {stats && (
                          <>
                            <p className="text-[11px] text-slate-400">Ativos</p>
                            <p className="text-sm font-semibold">
                              {stats.activeCustomers}
                            </p>
                          </>
                        )}
                        <span
                          className={[
                            "inline-flex mt-1 rounded-full px-2 py-[1px] text-[9px]",
                            plan.isActive
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-slate-700 text-slate-200",
                          ].join(" ")}
                        >
                          {plan.isActive ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detalhe do plano selecionado */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
            {selectedPlan ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[11px] text-slate-400">
                      Plano selecionado
                    </p>
                    <p className="text-sm font-semibold">{selectedPlan.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {selectedPlan.periodLabel} · {selectedPlan.visitsIncluded}{" "}
                      visitas incluídas
                    </p>
                    {selectedPlan.minDaysBetweenVisits && (
                      <p className="text-[10px] text-slate-500">
                        Intervalo mínimo entre visitas:{" "}
                        {selectedPlan.minDaysBetweenVisits} dias
                      </p>
                    )}
                    <p className="mt-2 text-[11px] text-slate-300">
                      {selectedPlan.description}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-400">Preço base</p>
                    <p className="text-lg font-semibold">
                      € {selectedPlan.price}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {selectedPlan.currency} · faturado{" "}
                      {selectedPlan.periodLabel.toLowerCase()}
                    </p>

                    {!isEditingPlan && (
                      <button
                        type="button"
                        onClick={handleStartEditPlan}
                        className="mt-2 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-100 hover:border-emerald-500 hover:text-emerald-200"
                      >
                        Editar plano
                      </button>
                    )}
                  </div>
                </div>

                {editError && (
                  <p className="mb-2 text-[11px] text-rose-300">{editError}</p>
                )}

                {isEditingPlan && (
                  <form
                    onSubmit={handleUpdatePlan}
                    className="mb-4 space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <div className="md:col-span-2">
                        <label className="text-[10px] text-slate-400">
                          Nome do plano
                        </label>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400">
                          Preço (€)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400">
                          Visitas / mês
                        </label>
                        <input
                          type="number"
                          min={1}
                          className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                          value={editVisits}
                          onChange={(e) => setEditVisits(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400">
                          Intervalo mín. (dias)
                        </label>
                        <input
                          type="number"
                          min={1}
                          className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                          placeholder="Opcional"
                          value={editMinDaysBetween}
                          onChange={(e) =>
                            setEditMinDaysBetween(e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400">
                          Hora inicial (opcional)
                        </label>
                        <input
                          type="time"
                          className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                          value={editStartTime}
                          onChange={(e) => setEditStartTime(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400">
                          Hora final (opcional)
                        </label>
                        <input
                          type="time"
                          className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                          value={editEndTime}
                          onChange={(e) => setEditEndTime(e.target.value)}
                        />
                      </div>
                      <div>
                        <p className="mb-1 text-[10px] text-slate-400">
                          Dias permitidos (opcional)
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {WEEKDAYS.map((day) => {
                            const active = editAllowedWeekdays.includes(
                              day.value
                            );
                            return (
                              <button
                                key={day.value}
                                type="button"
                                onClick={() =>
                                  setEditAllowedWeekdays((prev) =>
                                    active
                                      ? prev.filter((v) => v !== day.value)
                                      : [...prev, day.value]
                                  )
                                }
                                className={[
                                  "rounded-full px-2 py-[3px] text-[10px] border",
                                  active
                                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-100"
                                    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500",
                                ].join(" ")}
                              >
                                {day.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400">
                        Descrição (opcional)
                      </label>
                      <textarea
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                        rows={2}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (editLoading) return;
                          setIsEditingPlan(false);
                          setEditError(null);
                        }}
                        className="text-[11px] text-slate-300 hover:text-slate-100"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={editLoading}
                        className="rounded-lg bg-emerald-500 px-3 py-1 text-[11px] font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                      >
                        {editLoading ? "Salvando..." : "Salvar alterações"}
                      </button>
                    </div>
                  </form>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Estado do plano */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Estado do plano
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {selectedPlan.isActive ? "Ativo" : "Inativo"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Depois vamos permitir ativar/desativar aqui de forma
                      segura.
                    </p>
                  </div>

                  {/* Regras de uso */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">Regras de uso</p>
                    <p className="mt-1 text-[11px] text-slate-300">
                      Dias permitidos:{" "}
                      <span className="text-slate-100">
                        {selectedPlanWeekdaysLabel || "Não definido"}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-300">
                      Horário permitido:{" "}
                      <span className="text-slate-100">
                        {selectedPlanTimeWindowLabel || "Não definido"}
                      </span>
                    </p>
                    {selectedPlan.minDaysBetweenVisits && (
                      <p className="mt-1 text-[11px] text-slate-300">
                        Intervalo mínimo:{" "}
                        <span className="text-slate-100">
                          {selectedPlan.minDaysBetweenVisits} dia(s)
                        </span>
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-slate-500">
                      Estas regras são opcionais. Se não forem definidas, o
                      plano é válido em qualquer dia e horário.
                    </p>
                  </div>

                  {/* Cobranças & pagamentos */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Cobranças &amp; pagamentos
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      {customers.length} cliente
                      {customers.length === 1 ? "" : "s"} com este plano
                    </p>

                    {customers.length === 0 ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Ainda não há clientes com este plano. Assim que
                        começarem a aderir, vais ver aqui o status de uso e de
                        pagamento.
                      </p>
                    ) : (
                      <div className="mt-2 max-h-40 overflow-y-auto space-y-2">
                        {customers.map((c) => {
                          const usageStatusLabel = (() => {
                            if (c.status === "active") return "Em uso";
                            if (c.status === "cancelled") return "Cancelado";
                            if (c.status === "suspended") return "Suspenso";
                            return c.status;
                          })();

                          const financialStatus = (() => {
                            if (!c.nextChargeDate || !c.nextChargeAmount) {
                              return {
                                label: "Sem dados de cobrança",
                                variant: "neutral" as const,
                              };
                            }

                            const nextDate = new Date(c.nextChargeDate);
                            const dueDate = new Date(nextDate);
                            dueDate.setDate(dueDate.getDate() + 8);

                            const now = new Date();

                            if (now <= dueDate) {
                              return {
                                label: "Em dia",
                                variant: "ok" as const,
                              };
                            }

                            return {
                              label: "Pagamento em atraso",
                              variant: "late" as const,
                            };
                          })();

                          const actionState = getPaymentActionState(
                            c,
                            ADVANCE_PAYMENT_DAYS
                          );

                          const badgeBase =
                            "inline-flex rounded-full px-2 py-[1px] text-[9px]";
                          const badgeClass =
                            financialStatus.variant === "ok"
                              ? "bg-emerald-500/20 text-emerald-100"
                              : financialStatus.variant === "late"
                              ? "bg-amber-500/20 text-amber-100"
                              : "bg-slate-700 text-slate-200";

                          return (
                            <div
                              key={c.id}
                              className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-[11px] font-medium">
                                    {c.name}
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    Uso: {usageStatusLabel}
                                  </p>
                                  {c.nextChargeAmount && (
                                    <p className="text-[10px] text-slate-400">
                                      Próxima cobrança: €{" "}
                                      {c.nextChargeAmount.toFixed(2)}
                                    </p>
                                  )}
                                </div>

                                <div className="text-right">
                                  {actionState === "canPay" && (
                                    <button
                                      type="button"
                                      onClick={() => handleRegisterPayment(c)}
                                      disabled={registeringPaymentId === c.id}
                                      className="mt-1 inline-flex items-center justify-center rounded-full border border-emerald-600 bg-emerald-600/20 px-2 py-[2px] text-[9px] text-emerald-50 hover:bg-emerald-500/30 disabled:opacity-60"
                                    >
                                      {registeringPaymentId === c.id
                                        ? "Registrando..."
                                        : "Registrar próximo mês"}
                                    </button>
                                  )}

                                  {actionState === "alreadyAdvanced" && (
                                    <span className="mt-1 inline-flex items-center justify-center rounded-full border border-emerald-700 bg-slate-900 px-2 py-[2px] text-[9px] text-emerald-200">
                                      Próx. mês já pago
                                    </span>
                                  )}

                                  {actionState === "tooEarly" && (
                                    <span className="mt-1 inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900 px-2 py-[2px] text-[9px] text-slate-300">
                                      Pagamento disponível mais perto da data
                                    </span>
                                  )}

                                  <span
                                    className={`${badgeBase} ${badgeClass} mt-1`}
                                  >
                                    {financialStatus.label}
                                  </span>
                                  {c.nextChargeDate && (
                                    <p className="mt-1 text-[9px] text-slate-500">
                                      Pagamento até 8 dias após{" "}
                                      {c.nextChargeDate}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <p className="mt-2 text-[10px] text-slate-500">
                      Regra visual atual: consideramos o pagamento em dia até 8
                      dias depois da data de próxima cobrança. Depois disso, o
                      cliente aparece como pagamento em atraso.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">
                Ainda não há nenhum plano cadastrado.
              </p>
            )}
          </div>

          {/* Estatísticas e clientes do plano */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400">Resumo numérico</p>
                <button className="text-[11px] text-emerald-400 hover:underline">
                  Ver relatório
                </button>
              </div>

              {selectedStats ? (
                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Clientes ativos
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {selectedStats.activeCustomers}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Receita recorrente (mês)
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      € {selectedStats.totalRevenueMonth}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] text-slate-400">
                      Churn aproximado
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {selectedStats.churnRatePercent}%
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Ainda não há dados suficientes para este plano.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400">Clientes neste plano</p>
                <div className="flex gap-2">
                  <button className="text-[11px] text-emerald-400 hover:underline">
                    Ver todos os pagamentos
                  </button>
                  {selectedPlan && (
                    <button
                      type="button"
                      onClick={() => setIsCreatingCustomer((prev) => !prev)}
                      className="text-[11px] text-emerald-400 hover:underline"
                    >
                      {isCreatingCustomer ? "Fechar form" : "Adicionar cliente"}
                    </button>
                  )}
                </div>
              </div>
              {createCustomerError && (
                <p className="mb-2 text-[11px] text-rose-300">
                  {createCustomerError}
                </p>
              )}

              {isCreatingCustomer && selectedPlan && (
                <form
                  onSubmit={handleCreateCustomer}
                  className="mb-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2"
                >
                  <p className="text-[11px] text-slate-300">
                    Adicionar cliente a{" "}
                    <span className="font-semibold">{selectedPlan.name}</span>
                  </p>

                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400">
                        Nome do cliente
                      </label>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400">
                        Telefone (opcional)
                      </label>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (createCustomerLoading) return;
                        setIsCreatingCustomer(false);
                        setCreateCustomerError(null);
                      }}
                      className="text-[11px] text-slate-300 hover:text-slate-100"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={createCustomerLoading}
                      className="rounded-lg bg-emerald-500 px-3 py-1 text-[11px] font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                    >
                      {createCustomerLoading
                        ? "Adicionando..."
                        : "Adicionar ao plano"}
                    </button>
                  </div>
                </form>
              )}

              {customers.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  Ainda não há clientes neste plano.
                </p>
              ) : (
                <div className="space-y-2">
                  {customers.map((c) => {
                    const actionState = getPaymentActionState(
                      c,
                      ADVANCE_PAYMENT_DAYS
                    );

                    return (
                      <div
                        key={c.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 flex items-center justify-between"
                      >
                        <div>
                          <p className="text-[11px] font-medium">{c.name}</p>
                          <p className="text-[11px] text-slate-400">
                            {c.phone}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Desde {c.startedAt}
                          </p>
                        </div>
                        <div className="text-right">
                          {c.nextChargeDate && c.nextChargeAmount && (
                            <p className="text-[10px] text-slate-400">
                              Próx. cobrança: {c.nextChargeDate}
                            </p>
                          )}

                          <PlanCustomerStatusBadge status={c.status} />

                          {actionState === "canPay" && (
                            <button
                              type="button"
                              onClick={() => handleRegisterPayment(c)}
                              disabled={registeringPaymentId === c.id}
                              className="mt-1 inline-flex items-center justify-center rounded-full border border-emerald-600 bg-emerald-600/20 px-2 py-[2px] text-[9px] text-emerald-50 hover:bg-emerald-500/30 disabled:opacity-60"
                            >
                              {registeringPaymentId === c.id
                                ? "Registrando..."
                                : "Registrar pagamento"}
                            </button>
                          )}

                          {actionState === "alreadyAdvanced" && (
                            <span className="mt-1 inline-flex items-center justify-center rounded-full border border-emerald-700 bg-slate-900 px-2 py-[2px] text-[9px] text-emerald-200">
                              Próx. mês já pago
                            </span>
                          )}

                          {actionState === "tooEarly" && (
                            <span className="mt-1 inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900 px-2 py-[2px] text-[9px] text-slate-300">
                              Pagamento disponível mais perto da data
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function PlanCustomerStatusBadge({
  status,
}: {
  status: PlanCustomer["status"];
}) {
  const base = "inline-block mt-1 px-2 py-[1px] rounded-full text-[9px]";
  switch (status) {
    case "active":
      return (
        <span className={`${base} bg-emerald-500/20 text-emerald-100`}>
          Ativo
        </span>
      );
    case "late":
      return (
        <span className={`${base} bg-amber-500/20 text-amber-100`}>
          Em atraso
        </span>
      );
    case "cancelled":
      return (
        <span className={`${base} bg-rose-500/20 text-rose-100`}>
          Cancelado
        </span>
      );
    default:
      return (
        <span className={`${base} bg-slate-600/40 text-slate-100`}>
          {status}
        </span>
      );
  }
}
