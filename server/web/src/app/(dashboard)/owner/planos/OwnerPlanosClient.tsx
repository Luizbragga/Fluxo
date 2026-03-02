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
  advanceDays: number,
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
  const initialCustomerName = searchParams.get("customerName") ?? "";
  const initialCustomerPhone = searchParams.get("customerPhone") ?? "";

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
    null,
  );
  const [hasAppliedCustomerFromUrl, setHasAppliedCustomerFromUrl] =
    useState(false);

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

  const [advanceModalCustomer, setAdvanceModalCustomer] =
    useState<PlanCustomer | null>(null);
  const [advanceMonths, setAdvanceMonths] = useState<1 | 2 | 3 | 4 | 5 | 6>(3);

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
    {} as Record<number, string>,
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
            (prev) => prev || initialLocationId || locs[0].id,
          );
        }
      } catch (err: any) {
        if (!cancelled) {
          setLocationsError(
            err?.message ?? "Erro ao carregar unidades (locations).",
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

  useEffect(() => {
    // só aplica uma vez e só se vier algo na URL
    if (hasAppliedCustomerFromUrl) return;

    if (!initialCustomerName && !initialCustomerPhone) return;

    setNewCustomerName(initialCustomerName || "");
    setNewCustomerPhone(initialCustomerPhone || "");

    // já abre o form de "Adicionar cliente" automaticamente
    setIsCreatingCustomer(true);

    setHasAppliedCustomerFromUrl(true);
  }, [hasAppliedCustomerFromUrl, initialCustomerName, initialCustomerPhone]);

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
              : (result.planTemplates[0]?.id ?? null),
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
            err?.message ?? "Erro ao carregar serviços para montagem do plano.",
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
      selectedServiceIds.includes(s.id),
    );
    if (selectedServices.length === 0) return;

    const basePerVisit = selectedServices.reduce(
      (sum, s) => sum + s.priceEuro,
      0,
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
    selectedServiceIds.includes(s.id),
  );
  const basePerVisit = selectedServicesForDisplay.reduce(
    (sum, s) => sum + s.priceEuro,
    0,
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
        "Para criar um plano, seleciona primeiro uma unidade (location).",
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
          "Intervalo mínimo entre visitas deve ser um número maior que zero.",
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

      const created = await createOwnerPlanTemplate({
        locationId: selectedLocationId,
        name,
        description,
        priceEuro: priceNumber,
        intervalDays: 30,
        visitsPerInterval: visitsNumber,
        sameDayServiceIds: selectedServiceIds,
        minDaysBetweenVisits: minDaysBetweenNumber,
        allowedWeekdays:
          formAllowedWeekdays.length > 0 ? formAllowedWeekdays : undefined,
        allowedStartTimeMinutes: startMinutes ?? undefined,
        allowedEndTimeMinutes: endMinutes ?? undefined,
      });

      setFormStartTime("");
      setFormEndTime("");
      setFormAllowedWeekdays([]);

      setData((prev) => {
        if (!prev) return prev;

        const newPlanTemplates = [...prev.planTemplates, created].sort((a, b) =>
          a.name.localeCompare(b.name),
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

  const selectedPlan =
    selectedId && data
      ? (data.planTemplates.find((p) => p.id === selectedId) ?? null)
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
        : "",
    );
    setEditAllowedWeekdays(selectedPlan.allowedWeekdays ?? []);

    setEditStartTime(
      selectedPlan.allowedStartTimeMinutes != null
        ? minutesToTimeLabel(selectedPlan.allowedStartTimeMinutes)
        : "",
    );
    setEditEndTime(
      selectedPlan.allowedEndTimeMinutes != null
        ? minutesToTimeLabel(selectedPlan.allowedEndTimeMinutes)
        : "",
    );

    setEditError(null);
    setIsEditingPlan(true);
  }

  async function handleRegisterPayment(customer: PlanCustomer, months: number) {
    if (!selectedPlan || !selectedLocationId) return;

    // regra do botão "pagar próximo": só libera se o backend disser que pode
    if (months === 1) {
      const canPayNext =
        customer.canPayNextCycle ?? customer.canRegisterPayment ?? true;
      if (!canPayNext) return;
    }

    const label =
      months === 1 ? "próximo mês" : `${months} mês(es) adiantado(s)`;

    const confirmMsg = `Registrar pagamento (${label}) de € ${selectedPlan.price.toFixed(
      2,
    )} para ${customer.name}?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setRegisteringPaymentId(customer.id);
      setError(null);

      await payOwnerCustomerPlan({
        customerPlanId: customer.id,
        amountEuro: selectedPlan.price,
        months,
      });

      const result = await fetchOwnerPlans({ locationId: selectedLocationId });
      setData(result);
    } catch (err: any) {
      console.error(err);
      setError(
        err?.message ?? "Erro ao registrar pagamento do plano deste cliente.",
      );
    } finally {
      setRegisteringPaymentId(null);
    }
  }

  async function handleCreateCustomer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedLocationId) {
      setCreateCustomerError(
        "Seleciona uma unidade antes de adicionar clientes ao plano.",
      );
      return;
    }

    if (!selectedPlan) {
      setCreateCustomerError(
        "Seleciona primeiro um plano para adicionar clientes.",
      );
      return;
    }

    try {
      setCreateCustomerLoading(true);
      setCreateCustomerError(null);

      const name = newCustomerName.trim();
      const phone = newCustomerPhone.trim();

      if (!name) throw new Error("Nome do cliente é obrigatório.");

      await createOwnerCustomerPlan({
        planTemplateId: selectedPlan.id,
        customerName: name,
        customerPhone: phone || undefined,
      });

      const updated = await fetchOwnerPlans({ locationId: selectedLocationId });

      setData(updated);
      setSelectedId(selectedPlan.id);

      setNewCustomerName("");
      setNewCustomerPhone("");
      setIsCreatingCustomer(false);
    } catch (err: any) {
      console.error(err);
      setCreateCustomerError(
        err?.message ?? "Erro ao adicionar cliente ao plano.",
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
      if (!name) throw new Error("Nome do plano é obrigatório.");

      const priceNumber = Number(editPrice.toString().replace(",", "."));
      if (!priceNumber || priceNumber <= 0)
        throw new Error("Preço deve ser maior que zero.");

      const visitsNumber = Number(editVisits);
      if (!visitsNumber || visitsNumber <= 0)
        throw new Error("Número de visitas por mês deve ser maior que zero.");

      const minDaysBetweenNumber = editMinDaysBetween
        ? Number(editMinDaysBetween)
        : undefined;
      if (
        editMinDaysBetween &&
        (!minDaysBetweenNumber || minDaysBetweenNumber <= 0)
      ) {
        throw new Error(
          "Intervalo mínimo entre visitas deve ser um número maior que zero.",
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

      if (editStartTime && startMinutes == null)
        throw new Error("Horário inicial inválido. Use o formato HH:MM.");
      if (editEndTime && endMinutes == null)
        throw new Error("Horário final inválido. Use o formato HH:MM.");
      if (
        startMinutes != null &&
        endMinutes != null &&
        endMinutes <= startMinutes
      )
        throw new Error("Horário final deve ser maior que o horário inicial.");

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
    return !plan.isActive;
  });

  const selectedStats = selectedId
    ? planStats.find((s) => s.planId === selectedId)
    : undefined;

  const customers: PlanCustomer[] = selectedId
    ? (planCustomersByPlan[selectedId] ?? [])
    : [];

  // textos derivados para mostrar as regras do plano selecionado
  let selectedPlanWeekdaysLabel = "";
  let selectedPlanTimeWindowLabel = "";

  if (selectedPlan) {
    const sp: any = selectedPlan;

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
            type="button"
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
            type="button"
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
            type="button"
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

      {/* Barra topo: unidade */}
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Unidade</span>

          <select
            value={selectedLocationId ?? ""}
            onChange={(e) => setSelectedLocationId(e.target.value || undefined)}
            disabled={locationsLoading}
            className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
          >
            {locationsLoading ? <option value="">Carregando...</option> : null}
            {!locationsLoading ? (
              <>
                <option value="">Selecione uma unidade</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </>
            ) : null}
          </select>

          {locationsError ? (
            <span className="text-[11px] text-rose-300">{locationsError}</span>
          ) : null}
        </div>

        <div className="text-[11px] text-slate-500">
          {selectedLocationId
            ? `Filtrando por unidade`
            : `Sem filtro de unidade`}
        </div>
      </div>

      {/* MODAL: criar plano */}
      {isCreating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Criar plano
                </p>
                <p className="text-sm font-semibold text-slate-100">
                  Novo plano de assinatura
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setCreatingError(null);
                }}
                className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-500/60 hover:text-emerald-200"
              >
                Fechar
              </button>
            </div>

            {creatingError ? (
              <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-[11px] text-rose-200">
                {creatingError}
              </div>
            ) : null}

            <form onSubmit={handleCreatePlan} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400">Nome</label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    placeholder="Ex.: Plano Barba + Cabelo"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-400">
                    Preço (€)
                  </label>
                  <input
                    value={formPrice}
                    onChange={(e) => {
                      setPriceAuto(false);
                      setFormPrice(e.target.value);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    placeholder="Ex.: 35"
                  />
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={priceAuto}
                        onChange={(e) => setPriceAuto(e.target.checked)}
                      />
                      Preço automático
                    </label>

                    {suggestedPriceDisplay ? (
                      <span>· Sugestão: € {suggestedPriceDisplay}</span>
                    ) : null}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400">
                    Visitas / mês
                  </label>
                  <input
                    value={formVisits}
                    onChange={(e) => setFormVisits(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    placeholder="Ex.: 2"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-400">
                    Intervalo mín. entre visitas (dias)
                  </label>
                  <input
                    value={formMinDaysBetween}
                    onChange={(e) => setFormMinDaysBetween(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    placeholder="Opcional"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-400">Início</label>
                  <input
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    placeholder="HH:MM (opcional)"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-400">Fim</label>
                  <input
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    placeholder="HH:MM (opcional)"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400">
                  Dias permitidos
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const active = formAllowedWeekdays.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => {
                          setFormAllowedWeekdays((prev) =>
                            active
                              ? prev.filter((x) => x !== d.value)
                              : [...prev, d.value],
                          );
                        }}
                        className={[
                          "px-3 py-1 rounded-lg border text-[11px]",
                          active
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                            : "border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-700",
                        ].join(" ")}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] text-slate-300 font-medium">
                    Serviços do plano
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsServicePickerOpen((v) => !v)}
                    className="text-[11px] text-emerald-300 hover:underline"
                  >
                    {isServicePickerOpen ? "Fechar" : "Selecionar"}
                  </button>
                </div>

                {servicesLoading ? (
                  <p className="text-[11px] text-slate-400">
                    Carregando serviços...
                  </p>
                ) : servicesError ? (
                  <p className="text-[11px] text-rose-300">{servicesError}</p>
                ) : null}

                {isServicePickerOpen ? (
                  <div className="mt-2 max-h-44 overflow-auto pr-1 space-y-2">
                    {services.map((s) => {
                      const checked = selectedServiceIds.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-[11px] text-slate-200 truncate">
                              {s.name}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              € {Number(s.priceEuro ?? 0).toFixed(2)}
                            </p>
                          </div>

                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const isOn = e.target.checked;
                              setSelectedServiceIds((prev) =>
                                isOn
                                  ? [...prev, s.id]
                                  : prev.filter((id) => id !== s.id),
                              );
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400">
                    Selecionados:{" "}
                    {selectedServicesForDisplay.length > 0
                      ? selectedServicesForDisplay.map((x) => x.name).join(", ")
                      : "nenhum"}
                  </div>
                )}

                <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={applyDiscount}
                      onChange={(e) => setApplyDiscount(e.target.checked)}
                    />
                    Aplicar desconto
                  </label>

                  {applyDiscount ? (
                    <select
                      value={discountPercent}
                      onChange={(e) =>
                        setDiscountPercent(Number(e.target.value) as any)
                      }
                      className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1 text-slate-100"
                    >
                      <option value={5}>5%</option>
                      <option value={10}>10%</option>
                      <option value={15}>15%</option>
                    </select>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setCreatingError(null);
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-950/40 text-[11px] text-slate-200 hover:border-slate-500"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={creatingLoading}
                  className={[
                    "px-3 py-2 rounded-lg border text-[11px]",
                    creatingLoading
                      ? "border-slate-800 bg-slate-900/40 text-slate-400"
                      : "border-emerald-600 bg-emerald-600/20 text-emerald-200 hover:border-emerald-500",
                  ].join(" ")}
                >
                  {creatingLoading ? "Criando..." : "Criar plano"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Layout principal */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lista de planos */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-100">Planos</p>
            <span className="text-[11px] text-slate-500">
              {filteredPlanTemplates.length} item(ns)
            </span>
          </div>

          {filteredPlanTemplates.length === 0 ? (
            <p className="text-[12px] text-slate-400">
              Nenhum plano encontrado nesse filtro/unidade.
            </p>
          ) : (
            <div className="space-y-2">
              {filteredPlanTemplates.map((p) => {
                const isSelected = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={[
                      "w-full text-left rounded-xl border px-3 py-2 transition-colors",
                      isSelected
                        ? "border-emerald-500/60 bg-emerald-500/10"
                        : "border-slate-800 bg-slate-950/40 hover:border-slate-700",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-medium text-slate-100 truncate">
                        {p.name}
                      </p>
                      <span className="text-[11px] text-slate-300">
                        € {p.price.toFixed(2)}
                      </span>
                    </div>

                    <p className="mt-1 text-[11px] text-slate-400 truncate">
                      {p.description ?? "Sem descrição"}
                    </p>

                    <div className="mt-2 flex items-center justify-between">
                      <PlanCustomerStatusBadge
                        status={p.isActive ? "active" : "cancelled"}
                      />
                      <span className="text-[10px] text-slate-500">
                        {p.visitsIncluded} visita(s)/mês
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detalhes */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          {!selectedPlan ? (
            <p className="text-[12px] text-slate-400">
              Selecione um plano para ver detalhes.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100 truncate">
                    {selectedPlan.name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    € {selectedPlan.price.toFixed(2)} ·{" "}
                    {selectedPlan.visitsIncluded} visita(s) ·{" "}
                    {selectedPlan.minDaysBetweenVisits != null
                      ? `mín. ${selectedPlan.minDaysBetweenVisits} dias`
                      : "sem intervalo mínimo"}
                  </p>

                  <p className="mt-2 text-[11px] text-slate-500">
                    Dias: {selectedPlanWeekdaysLabel || "—"} · Horário:{" "}
                    {selectedPlanTimeWindowLabel || "—"}
                  </p>

                  {selectedPlan.description ? (
                    <p className="mt-2 text-[12px] text-slate-200">
                      {selectedPlan.description}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleStartEditPlan}
                    className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-200 hover:border-emerald-500/60 hover:text-emerald-200"
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingCustomer(true);
                      setCreateCustomerError(null);
                    }}
                    className="rounded-lg border border-emerald-600 bg-emerald-600/20 px-3 py-2 text-[11px] text-emerald-200 hover:border-emerald-500"
                  >
                    + Adicionar cliente
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] text-slate-400">Clientes ativos</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">
                    {selectedStats?.activeCustomers ?? 0}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] text-slate-400">Receita (mês)</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">
                    € {(selectedStats?.totalRevenueMonth ?? 0).toFixed(2)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] text-slate-400">Churn</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">
                    {(selectedStats?.churnRatePercent ?? 0).toFixed(0)}%
                  </p>
                </div>
              </div>

              {/* Clientes */}
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] text-slate-300 font-medium">
                    Clientes do plano
                  </p>
                  <span className="text-[11px] text-slate-500">
                    {customers.length} cliente(s)
                  </span>
                </div>

                {error ? (
                  <p className="mb-2 text-[11px] text-rose-300">{error}</p>
                ) : null}

                {customers.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    Nenhum cliente neste plano ainda.
                  </p>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full min-w-[760px] border-collapse text-[11px]">
                      <thead>
                        <tr className="text-slate-400">
                          <th className="text-left py-2 pr-3 border-b border-slate-800">
                            Cliente
                          </th>
                          <th className="text-left py-2 pr-3 border-b border-slate-800">
                            Status
                          </th>
                          <th className="text-left py-2 pr-3 border-b border-slate-800">
                            Próx. cobrança
                          </th>
                          <th className="text-left py-2 pr-3 border-b border-slate-800">
                            Pago até
                          </th>
                          <th className="text-right py-2 pl-3 border-b border-slate-800">
                            Ações
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {customers.map((c) => {
                          const loadingPay = registeringPaymentId === c.id;
                          const canPayNext =
                            c.canPayNextCycle ?? c.canRegisterPayment ?? false;

                          return (
                            <tr key={c.id} className="hover:bg-slate-950/50">
                              <td className="py-2 pr-3 text-slate-200">
                                <p className="font-medium">{c.name}</p>
                                <p className="text-[10px] text-slate-500">
                                  {c.phone ?? "—"}
                                </p>
                              </td>

                              <td className="py-2 pr-3">
                                <PlanCustomerStatusBadge status={c.status} />
                              </td>

                              <td className="py-2 pr-3 text-slate-200">
                                {c.nextChargeDate
                                  ? new Date(
                                      c.nextChargeDate,
                                    ).toLocaleDateString("pt-PT", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      year: "numeric",
                                    })
                                  : "—"}
                              </td>

                              <td className="py-2 pr-3 text-slate-200">
                                {c.paidThrough
                                  ? new Date(c.paidThrough).toLocaleDateString(
                                      "pt-PT",
                                      {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                      },
                                    )
                                  : c.nextChargeDate
                                    ? new Date(
                                        c.nextChargeDate,
                                      ).toLocaleDateString("pt-PT", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                      })
                                    : "—"}
                              </td>

                              <td className="py-2 pl-3 text-right">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={loadingPay || !canPayNext}
                                    onClick={() => handleRegisterPayment(c, 1)}
                                    className={[
                                      "rounded-lg border px-3 py-1 text-[11px]",
                                      loadingPay || !canPayNext
                                        ? "border-slate-800 bg-slate-900/40 text-slate-400"
                                        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400 hover:text-emerald-100",
                                    ].join(" ")}
                                    title={
                                      canPayNext
                                        ? "Pagar o próximo mês"
                                        : c.nextChargeDate
                                          ? `Só pode pagar nos últimos 30 dias antes do vencimento (${new Date(
                                              c.nextChargeDate,
                                            ).toLocaleDateString("pt-PT")}).`
                                          : "Pagamento do próximo mês ainda não disponível."
                                    }
                                  >
                                    {loadingPay ? "..." : "Pagar mês"}
                                  </button>

                                  <button
                                    type="button"
                                    disabled={loadingPay}
                                    onClick={() => {
                                      setAdvanceMonths(3);
                                      setAdvanceModalCustomer(c);
                                    }}
                                    className={[
                                      "rounded-lg border px-3 py-1 text-[11px]",
                                      loadingPay
                                        ? "border-slate-800 bg-slate-900/40 text-slate-400"
                                        : "border-slate-700 bg-slate-950/40 text-slate-200 hover:border-slate-500",
                                    ].join(" ")}
                                  >
                                    Adiantar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>
      {advanceModalCustomer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Adiantamento
                </p>
                <p className="text-sm font-semibold text-slate-100">
                  {advanceModalCustomer.name}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Plano: {selectedPlan?.name ?? "—"} · €{" "}
                  {selectedPlan?.price.toFixed(2) ?? "—"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAdvanceModalCustomer(null)}
                className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] text-slate-200 hover:border-slate-500"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400">
                  Quantos meses deseja adiantar? (1 a 6)
                </label>
                <select
                  value={advanceMonths}
                  onChange={(e) =>
                    setAdvanceMonths(Number(e.target.value) as any)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                >
                  <option value={1}>1 mês</option>
                  <option value={2}>2 meses</option>
                  <option value={3}>3 meses</option>
                  <option value={4}>4 meses</option>
                  <option value={5}>5 meses</option>
                  <option value={6}>6 meses</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdvanceModalCustomer(null)}
                  className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-950/40 text-[11px] text-slate-200 hover:border-slate-500"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={registeringPaymentId === advanceModalCustomer.id}
                  onClick={async () => {
                    const c = advanceModalCustomer;
                    setAdvanceModalCustomer(null);
                    await handleRegisterPayment(c, advanceMonths);
                  }}
                  className={[
                    "px-3 py-2 rounded-lg border text-[11px]",
                    registeringPaymentId === advanceModalCustomer.id
                      ? "border-slate-800 bg-slate-900/40 text-slate-400"
                      : "border-emerald-600 bg-emerald-600/20 text-emerald-200 hover:border-emerald-500",
                  ].join(" ")}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {/* MODAL: adicionar cliente */}
      {isCreatingCustomer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Adicionar cliente
                </p>
                <p className="text-sm font-semibold text-slate-100">
                  {selectedPlan ? selectedPlan.name : "Selecione um plano"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsCreatingCustomer(false);
                  setCreateCustomerError(null);
                }}
                className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-500/60 hover:text-emerald-200"
              >
                Fechar
              </button>
            </div>

            {createCustomerError ? (
              <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-[11px] text-rose-200">
                {createCustomerError}
              </div>
            ) : null}

            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400">Nome</label>
                <input
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400">Telefone</label>
                <input
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingCustomer(false);
                    setCreateCustomerError(null);
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-950/40 text-[11px] text-slate-200 hover:border-slate-500"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={createCustomerLoading}
                  className={[
                    "px-3 py-2 rounded-lg border text-[11px]",
                    createCustomerLoading
                      ? "border-slate-800 bg-slate-900/40 text-slate-400"
                      : "border-emerald-600 bg-emerald-600/20 text-emerald-200 hover:border-emerald-500",
                  ].join(" ")}
                >
                  {createCustomerLoading ? "Adicionando..." : "Adicionar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
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
