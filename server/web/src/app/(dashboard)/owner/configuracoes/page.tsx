"use client";

// src/app/(dashboard)/owner/configuracoes/page.tsx

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  fetchOwnerLocations,
  type OwnerLocation,
} from "../_api/owner-locations";
import { fetchOwnerUsers, type OwnerUser } from "../_api/owner-users";
import { fetchOwnerTenantMe, updateOwnerTenantMe } from "../_api/owner-tenant";
import {
  fetchOwnerTenantSettings,
  updateOwnerTenantSettings,
  type TenantSettings,
} from "../_api/owner-tenant-settings";
import { apiClient, ApiError } from "@/lib/api-client";
import { createOwnerInvite, CreateInviteInput } from "../_api/owner-invites";
/**
 * Tipagem local alinhada com o que o backend devolve em /v1/tenants/settings
 * (inclui Preferências + Notificações + Segurança + extras opcionais)
 */
type TenantSettingsDTO = {
  timezone: string;
  defaultCurrency: string;
  dateFormat: string;
  use24hClock: boolean;

  // Notificações
  emailNewBooking: boolean;
  emailCancellation: boolean;
  emailReschedule: boolean;
  notifyProvidersNewBooking: boolean;
  notifyProvidersChanges: boolean;
  clientRemindersEnabled: boolean;
  reminderHoursBefore: number;

  // Segurança (MVP)
  sessionIdleTimeoutMin: number;
  requireReauthForSensitiveActions: boolean;
  twoFactorEnabled: boolean;

  // Agenda
  bufferBetweenAppointmentsMin: number;
  allowOverbooking: boolean;
  bookingIntervalMin: number; // 5, 10, 15, 20, 30, 45, 60

  // Cancelamento / no-show (extras)
  minCancelNoticeHours: number;
  autoNoShowEnabled?: boolean;
  noShowAfterMin?: number | null;
  defaultPaymentMethod?: string | null;
};

type TenantSettingsUI = {
  legalName: string;
  brandName: string;
  defaultCurrency: "EUR";
  country: string;
  timezone: string;
  contactEmail: string;
  contactPhone: string;
  tenantId: string | null;
  nif: string | null;
};

type UserRole = "owner" | "admin" | "attendant" | "provider" | "unknown";
type SettingsTab = "prefs" | "notifications" | "security";
const BOOKING_INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 45, 60] as const;
const FALLBACK_TIMEZONES = [
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Atlantic/Azores",
  "Atlantic/Madeira",
  "America/Sao_Paulo",
  "America/Fortaleza",
  "America/Recife",
  "America/Manaus",
  "America/Belem",
  "America/New_York",
  "America/Los_Angeles",
  "America/Mexico_City",
] as const;
const CURRENCY_OPTIONS = ["EUR", "USD", "GBP", "BRL"] as const;
const DATE_FORMAT_OPTIONS = [
  "dd/MM/yyyy", // PT / BR
  "MM/dd/yyyy", // US
  "yyyy-MM-dd", // ISO
] as const;

function normalizeRole(role: string | null | undefined): UserRole {
  const r = (role ?? "").toLowerCase().trim();
  if (r === "owner") return "owner";
  if (r === "admin") return "admin";
  if (r === "attendant") return "attendant";
  if (r === "provider") return "provider";
  return "unknown";
}

export default function OwnerConfiguracoesPage() {
  const [tenant, setTenant] = useState<TenantSettingsUI>({
    legalName: "—",
    brandName: "—",
    defaultCurrency: "EUR",
    country: "Portugal",
    timezone: "Europe/Lisbon",
    contactEmail: "—",
    contactPhone: "—",
    tenantId: null,
    nif: null,
  });

  const [locations, setLocations] = useState<OwnerLocation[]>([]);
  const [users, setUsers] = useState<OwnerUser[]>([]);

  const [settings, setSettings] = useState<TenantSettingsDTO | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ===== Dados da marca (edição) =====
  const [isEditingBrand, setIsEditingBrand] = useState(false);
  const [isSavingBrand, setIsSavingBrand] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);

  const [draftBrand, setDraftBrand] = useState<{
    legalName: string;
    brandName: string;
    nif: string;
  } | null>(null);

  // Tabs (por padrão: NADA aberto)
  const [activeTab, setActiveTab] = useState<SettingsTab | null>(null);

  // Preferências (edição)
  const [isEditingPrefs, setIsEditingPrefs] = useState(false);
  const [draftPrefs, setDraftPrefs] = useState<Pick<
    TenantSettingsDTO,
    | "timezone"
    | "defaultCurrency"
    | "dateFormat"
    | "use24hClock"
    | "bufferBetweenAppointmentsMin"
    | "allowOverbooking"
    | "bookingIntervalMin"
    | "minCancelNoticeHours"
  > | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  // Notificações (edição)
  const [isEditingNotifs, setIsEditingNotifs] = useState(false);
  const [draftNotifs, setDraftNotifs] = useState<Pick<
    TenantSettingsDTO,
    | "emailNewBooking"
    | "emailCancellation"
    | "emailReschedule"
    | "notifyProvidersNewBooking"
    | "notifyProvidersChanges"
    | "clientRemindersEnabled"
    | "reminderHoursBefore"
  > | null>(null);
  const [notifsError, setNotifsError] = useState<string | null>(null);
  const [isSavingNotifs, setIsSavingNotifs] = useState(false);

  // Segurança (edição)
  const [isEditingSecurity, setIsEditingSecurity] = useState(false);
  const [draftSecurity, setDraftSecurity] = useState<Pick<
    TenantSettingsDTO,
    | "sessionIdleTimeoutMin"
    | "requireReauthForSensitiveActions"
    | "twoFactorEnabled"
  > | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);

  // =========================
  // REAUTH (modal + retry)
  // =========================
  type ReauthArea = "prefs" | "notifications" | "security" | "brand";

  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [reauthLoading, setReauthLoading] = useState(false);
  const [reauthArea, setReauthArea] = useState<ReauthArea | null>(null);

  const [pendingAction, setPendingAction] = useState<
    null | (() => Promise<void>)
  >(null);

  function isReauthRequired(err: any): boolean {
    // ApiError agora vem tipado do api-client.ts (passo 1)
    return (
      (err instanceof ApiError || err?.name === "ApiError") &&
      err?.code === "REAUTH_REQUIRED"
    );
  }
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const [inviteForm, setInviteForm] = useState<CreateInviteInput>({
    role: "provider",
    specialty: "barber",
    locationId: undefined,
    email: "",
    phone: "",
    expiresInHours: 72,
  });

  const locationOptions = useMemo(() => {
    return locations.map((l) => ({ id: l.id, name: l.name }));
  }, [locations]);

  const locationNameById = useMemo(() => {
    return new Map(locations.map((l) => [l.id, l.name] as const));
  }, [locations]);

  function setAreaError(area: ReauthArea, message: string) {
    if (area === "prefs") setPrefsError(message);
    if (area === "notifications") setNotifsError(message);
    if (area === "security") setSecurityError(message);
    if (area === "brand") setBrandError(message);
  }

  function openReauth(area: ReauthArea, retryFn: () => Promise<void>) {
    setReauthArea(area);
    setPendingAction(() => retryFn);
    setReauthPassword("");
    setReauthError(null);
    setReauthOpen(true);
  }

  function cancelReauth() {
    if (reauthArea) {
      setAreaError(
        reauthArea,
        "Para salvar esta alteração, é necessário reautenticar com a sua senha."
      );
    }
    setReauthOpen(false);
    setReauthPassword("");
    setReauthError(null);
    setReauthArea(null);
    setPendingAction(null);
  }

  async function confirmReauth() {
    if (!reauthPassword.trim()) {
      setReauthError("Digite sua senha.");
      return;
    }

    try {
      setReauthLoading(true);
      setReauthError(null);

      const res = await apiClient<{
        tokens: { access: string; refresh: string };
      }>("/auth/reauth", {
        method: "POST",
        body: { password: reauthPassword },
      });

      if (typeof window !== "undefined") {
        localStorage.setItem("fluxo_token", res.tokens.access);
        localStorage.setItem("fluxo_refresh_token", res.tokens.refresh);
      }

      setReauthOpen(false);

      const action = pendingAction;
      const area = reauthArea;

      setPendingAction(null);
      setReauthArea(null);
      setReauthPassword("");

      if (action) {
        await action();
      } else if (area) {
        setAreaError(area, "Ação pendente não encontrada para repetir o save.");
      }
    } catch (err: any) {
      // senha errada -> backend manda 401 Unauthorized
      setReauthError(
        err?.message ?? "Falha ao reautenticar. Verifique a senha."
      );
    } finally {
      setReauthLoading(false);
    }
  }

  const timezoneOptions = useMemo(() => {
    // Preferência: pegar a lista oficial do runtime (Chrome moderno suporta)
    const intlAny = Intl as any;

    const list: string[] =
      typeof intlAny?.supportedValuesOf === "function"
        ? (intlAny.supportedValuesOf("timeZone") as string[])
        : [...FALLBACK_TIMEZONES];

    // normaliza e ordena
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const tenantId =
          typeof window !== "undefined"
            ? localStorage.getItem("fluxo_tenant")
            : null;

        const [tenantRes, settingsRes, locRes, userRes] = await Promise.all([
          fetchOwnerTenantMe(),
          fetchOwnerTenantSettings(),
          fetchOwnerLocations({ page: 1, pageSize: 200 }),
          fetchOwnerUsers(),
        ]);
        setTenant((prev) => ({
          ...prev,
          tenantId,
          legalName: tenantRes.legalName ?? "—",
          brandName: tenantRes.brandName ?? "—",

          nif: tenantRes.nif ?? null,
          timezone: (settingsRes as any)?.timezone ?? prev.timezone,
          defaultCurrency:
            (settingsRes as any)?.defaultCurrency ?? prev.defaultCurrency,
        }));

        if (cancelled) return;

        setLocations(locRes.data);
        setUsers(userRes);
        setSettings(settingsRes as TenantSettingsDTO);

        // email/phone do user logado (se existir)
        try {
          const me = await apiClient<any>("/users/me", { method: "GET" });
          if (!cancelled) {
            setTenant((prev) => ({
              ...prev,
              contactEmail: me?.email ?? prev.contactEmail,
              contactPhone: me?.phone ?? prev.contactPhone,
            }));
          }
        } catch {
          // não bloqueia
        }
      } catch (err: any) {
        if (cancelled) return;
        setErrorMessage(
          err?.message ??
            "Erro ao carregar configurações. Verifica a API e o token."
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Preferências ----------
  function startEditPrefs() {
    if (!settings) return;
    setPrefsError(null);
    setDraftPrefs({
      timezone: settings.timezone,
      defaultCurrency: settings.defaultCurrency,
      dateFormat: settings.dateFormat,
      use24hClock: settings.use24hClock,
      bufferBetweenAppointmentsMin: settings.bufferBetweenAppointmentsMin,
      allowOverbooking: settings.allowOverbooking,
      bookingIntervalMin: settings.bookingIntervalMin,
      minCancelNoticeHours: settings.minCancelNoticeHours,
    });
    setIsEditingPrefs(true);
  }

  function cancelEditPrefs() {
    setPrefsError(null);
    setDraftPrefs(null);
    setIsEditingPrefs(false);
  }

  async function savePrefs() {
    if (!draftPrefs) return;

    const doSave = async () => {
      // valida timezone antes de salvar
      if (!timezoneOptions.includes(draftPrefs.timezone)) {
        setPrefsError("Timezone inválido. Selecione um timezone da lista.");
        return;
      }
      if (!CURRENCY_OPTIONS.includes(draftPrefs.defaultCurrency as any)) {
        setPrefsError("Moeda inválida. Selecione uma moeda da lista.");
        return;
      }
      if (!DATE_FORMAT_OPTIONS.includes(draftPrefs.dateFormat as any)) {
        setPrefsError(
          "Formato de data inválido. Selecione um formato da lista."
        );
        return;
      }
      if (
        !Number.isFinite(draftPrefs.minCancelNoticeHours) ||
        draftPrefs.minCancelNoticeHours < 0 ||
        draftPrefs.minCancelNoticeHours > 720
      ) {
        setPrefsError(
          "Aviso mínimo de cancelamento inválido. Use um valor entre 0 e 720 horas."
        );
        return;
      }

      const payload = {
        ...draftPrefs,
        minCancelNoticeHours: Math.trunc(draftPrefs.minCancelNoticeHours),
        bufferBetweenAppointmentsMin: Math.trunc(
          draftPrefs.bufferBetweenAppointmentsMin
        ),
        bookingIntervalMin: Math.trunc(draftPrefs.bookingIntervalMin),
      };

      const updated = await apiClient<TenantSettingsDTO>("/tenants/settings", {
        method: "PATCH",
        body: payload,
      });

      setSettings(updated);
      setDraftPrefs(null);
      setIsEditingPrefs(false);
    };

    try {
      setIsSavingPrefs(true);
      setPrefsError(null);
      await doSave();
    } catch (e: any) {
      console.error(e);

      if (isReauthRequired(e)) {
        openReauth("prefs", async () => {
          setIsSavingPrefs(true);
          setPrefsError(null);
          try {
            await doSave();
          } finally {
            setIsSavingPrefs(false);
          }
        });
        return;
      }

      setPrefsError("Não foi possível salvar as preferências gerais.");
    } finally {
      setIsSavingPrefs(false);
    }
  }

  // ---------- Notificações ----------
  function startEditNotifs() {
    if (!settings) return;
    setNotifsError(null);
    setDraftNotifs({
      emailNewBooking: settings.emailNewBooking,
      emailCancellation: settings.emailCancellation,
      emailReschedule: settings.emailReschedule,
      notifyProvidersNewBooking: settings.notifyProvidersNewBooking,
      notifyProvidersChanges: settings.notifyProvidersChanges,
      clientRemindersEnabled: settings.clientRemindersEnabled,
      reminderHoursBefore: settings.reminderHoursBefore,
    });
    setIsEditingNotifs(true);
  }

  function cancelEditNotifs() {
    setNotifsError(null);
    setDraftNotifs(null);
    setIsEditingNotifs(false);
  }

  async function saveNotifs() {
    if (!draftNotifs) return;

    const doSave = async () => {
      const updated = await apiClient<TenantSettingsDTO>("/tenants/settings", {
        method: "PATCH",
        body: draftNotifs,
      });

      setSettings(updated);
      setDraftNotifs(null);
      setIsEditingNotifs(false);
    };

    try {
      setIsSavingNotifs(true);
      setNotifsError(null);

      await doSave();
    } catch (e: any) {
      console.error(e);

      if (isReauthRequired(e)) {
        openReauth("notifications", async () => {
          setIsSavingNotifs(true);
          setNotifsError(null);
          try {
            await doSave();
          } finally {
            setIsSavingNotifs(false);
          }
        });
        return;
      }

      setNotifsError("Não foi possível salvar as notificações.");
    } finally {
      setIsSavingNotifs(false);
    }
  }

  // ---------- Segurança ----------
  function startEditSecurity() {
    if (!settings) return;
    setSecurityError(null);
    setDraftSecurity({
      sessionIdleTimeoutMin: settings.sessionIdleTimeoutMin,
      requireReauthForSensitiveActions:
        settings.requireReauthForSensitiveActions,
      twoFactorEnabled: settings.twoFactorEnabled,
    });
    setIsEditingSecurity(true);
  }

  function cancelEditSecurity() {
    setSecurityError(null);
    setDraftSecurity(null);
    setIsEditingSecurity(false);
  }

  async function saveSecurity() {
    if (!draftSecurity) return;

    const doSave = async () => {
      const updated = await apiClient<TenantSettingsDTO>("/tenants/settings", {
        method: "PATCH",
        body: draftSecurity,
      });

      setSettings(updated);
      setDraftSecurity(null);
      setIsEditingSecurity(false);
    };

    try {
      setIsSavingSecurity(true);
      setSecurityError(null);

      await doSave();
    } catch (e: any) {
      console.error(e);

      if (isReauthRequired(e)) {
        openReauth("security", async () => {
          setIsSavingSecurity(true);
          setSecurityError(null);
          try {
            await doSave();
          } finally {
            setIsSavingSecurity(false);
          }
        });
        return;
      }

      setSecurityError(
        "Não foi possível salvar as configurações de segurança."
      );
    } finally {
      setIsSavingSecurity(false);
    }
  }
  function startEditBrand() {
    setBrandError(null);
    setDraftBrand({
      legalName: tenant.legalName === "—" ? "" : tenant.legalName,
      brandName: tenant.brandName === "—" ? "" : tenant.brandName,
      nif: tenant.nif ?? "",
    });

    setIsEditingBrand(true);
  }

  function cancelEditBrand() {
    setBrandError(null);
    setDraftBrand(null);
    setIsEditingBrand(false);
  }

  async function saveBrand() {
    if (!draftBrand) return;

    const doSave = async () => {
      const payload = {
        legalName: draftBrand.legalName.trim() || null,
        brandName: draftBrand.brandName.trim() || null,
        nif: draftBrand.nif.trim() ? draftBrand.nif.trim() : null,
      };

      const updated = await updateOwnerTenantMe(payload);

      setTenant((prev) => ({
        ...prev,
        legalName: updated.legalName ?? prev.legalName,
        brandName: updated.brandName ?? prev.brandName,
        nif: updated.nif ?? prev.nif,
      }));

      setBrandError(null);
      setDraftBrand(null);
      setIsEditingBrand(false);
    };

    try {
      setIsSavingBrand(true);
      setBrandError(null);

      if (!draftBrand.brandName.trim()) {
        setBrandError("O nome da marca não pode ficar vazio.");
        return;
      }

      await doSave();
    } catch (e: any) {
      console.error(e);

      // reaproveita o reauth que você já tem
      if (isReauthRequired(e)) {
        openReauth("brand", async () => {
          setIsSavingBrand(true);
          setBrandError(null);
          try {
            await doSave();
          } finally {
            setIsSavingBrand(false);
          }
        });
        return;
      }

      setBrandError("Não foi possível salvar os dados da marca.");
    } finally {
      setIsSavingBrand(false);
    }
  }

  return (
    <>
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Configurações</h1>
          <p className="text-xs text-slate-400">
            Dados da marca, unidades e utilizadores do espaço.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <TabButton
            active={activeTab === "prefs"}
            onClick={() => setActiveTab(activeTab === "prefs" ? null : "prefs")}
          >
            Preferências gerais
          </TabButton>

          <TabButton
            active={activeTab === "notifications"}
            onClick={() =>
              setActiveTab(
                activeTab === "notifications" ? null : "notifications"
              )
            }
          >
            Notificações
          </TabButton>

          <TabButton
            active={activeTab === "security"}
            onClick={() =>
              setActiveTab(activeTab === "security" ? null : "security")
            }
          >
            Segurança
          </TabButton>
        </div>
      </header>

      {errorMessage && (
        <div className="mb-4 rounded-xl border border-rose-900/40 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">
          {errorMessage}
        </div>
      )}

      {/* ====== BLOCO: Preferências gerais (só abre se clicar) ====== */}
      {activeTab === "prefs" && (
        <section className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-200 font-medium">Preferências gerais</p>
              <p className="text-[11px] text-slate-400">
                Regras globais do tenant (agenda, formatos e defaults).
              </p>
            </div>

            {!isEditingPrefs ? (
              <button
                onClick={startEditPrefs}
                className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-[11px]"
                disabled={!settings || isLoading}
              >
                Editar
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={cancelEditPrefs}
                  className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-[11px]"
                  disabled={isSavingPrefs}
                >
                  Cancelar
                </button>
                <button
                  onClick={savePrefs}
                  className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200 text-[11px]"
                  disabled={isSavingPrefs}
                >
                  {isSavingPrefs ? "Salvando..." : "Salvar"}
                </button>
              </div>
            )}
          </div>

          {prefsError && (
            <div className="mt-3 rounded-xl border border-rose-900/40 bg-rose-950/30 px-3 py-2 text-[11px] text-rose-200">
              {prefsError}
            </div>
          )}

          {isLoading ? (
            <p className="mt-3 text-[11px] text-slate-400">Carregando...</p>
          ) : !settings ? (
            <p className="mt-3 text-[11px] text-slate-400">
              Sem dados de preferências.
            </p>
          ) : !isEditingPrefs ? (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <PrefItem label="Timezone" value={settings.timezone} />
              <PrefItem label="Moeda padrão" value={settings.defaultCurrency} />
              <PrefItem label="Formato data" value={settings.dateFormat} />
              <PrefItem
                label="Relógio"
                value={settings.use24hClock ? "24h" : "12h"}
              />
              <PrefItem
                label="Intervalo (buffer)"
                value={`${settings.bufferBetweenAppointmentsMin} min`}
              />
              <PrefItem
                label="Step da agenda"
                value={`${settings.bookingIntervalMin} min`}
              />
              <PrefItem
                label="Overbooking"
                value={settings.allowOverbooking ? "Permitido" : "Bloqueado"}
              />
              <PrefItem
                label="Aviso mínimo cancel."
                value={`${settings.minCancelNoticeHours} h`}
              />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <FieldTimezoneSelect
                label="Timezone"
                value={draftPrefs?.timezone ?? "Europe/Lisbon"}
                options={timezoneOptions}
                onChange={(v) =>
                  setDraftPrefs((p) => (p ? { ...p, timezone: v } : p))
                }
              />

              <FieldCurrencySelect
                label="Moeda padrão"
                value={draftPrefs?.defaultCurrency ?? "EUR"}
                options={CURRENCY_OPTIONS}
                onChange={(v) =>
                  setDraftPrefs((p) => (p ? { ...p, defaultCurrency: v } : p))
                }
              />

              <FieldDateFormatSelect
                label="Formato data"
                value={draftPrefs?.dateFormat ?? "dd/MM/yyyy"}
                options={DATE_FORMAT_OPTIONS}
                onChange={(v) =>
                  setDraftPrefs((p) => (p ? { ...p, dateFormat: v } : p))
                }
              />

              <FieldToggle
                label="Relógio 24h (desative se quiser usar padrão 12h AM/PM)"
                checked={!!draftPrefs?.use24hClock}
                onChange={(checked) =>
                  setDraftPrefs((p) => (p ? { ...p, use24hClock: checked } : p))
                }
              />

              <FieldNumber
                label="Buffer (Minutos de espera entre agendamentos)"
                value={draftPrefs?.bufferBetweenAppointmentsMin ?? 0}
                onChange={(n) =>
                  setDraftPrefs((p) =>
                    p ? { ...p, bufferBetweenAppointmentsMin: n } : p
                  )
                }
              />

              <FieldSelect
                label="Step da agenda (min)"
                value={draftPrefs?.bookingIntervalMin ?? 15}
                options={BOOKING_INTERVAL_OPTIONS as unknown as number[]}
                onChange={(n) =>
                  setDraftPrefs((p) =>
                    p ? { ...p, bookingIntervalMin: n } : p
                  )
                }
              />

              <FieldToggle
                label="Overbooking"
                checked={!!draftPrefs?.allowOverbooking}
                onChange={(checked) =>
                  setDraftPrefs((p) =>
                    p ? { ...p, allowOverbooking: checked } : p
                  )
                }
              />

              <FieldNumber
                label="Aviso mínimo cancel. (h)"
                value={draftPrefs?.minCancelNoticeHours ?? 0}
                onChange={(n) =>
                  setDraftPrefs((p) =>
                    p ? { ...p, minCancelNoticeHours: n } : p
                  )
                }
              />
            </div>
          )}
        </section>
      )}

      {/* ====== BLOCO: Notificações (só abre se clicar) ====== */}
      {activeTab === "notifications" && (
        <section className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-200 font-medium">Notificações</p>
              <p className="text-[11px] text-slate-400">
                Preferências de avisos (salva no backend em TenantSettings).
              </p>
            </div>

            {!isEditingNotifs ? (
              <button
                onClick={startEditNotifs}
                className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-[11px]"
                disabled={!settings || isLoading}
              >
                Editar
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={cancelEditNotifs}
                  className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-[11px]"
                  disabled={isSavingNotifs}
                >
                  Cancelar
                </button>
                <button
                  onClick={saveNotifs}
                  className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200 text-[11px]"
                  disabled={isSavingNotifs}
                >
                  {isSavingNotifs ? "Salvando..." : "Salvar"}
                </button>
              </div>
            )}
          </div>

          {notifsError && (
            <div className="mt-3 rounded-xl border border-rose-900/40 bg-rose-950/30 px-3 py-2 text-[11px] text-rose-200">
              {notifsError}
            </div>
          )}

          {isLoading ? (
            <p className="mt-3 text-[11px] text-slate-400">Carregando...</p>
          ) : !settings ? (
            <p className="mt-3 text-[11px] text-slate-400">
              Sem dados de notificações.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-slate-200 font-medium">Owner / Gestão</p>
                <p className="text-[11px] text-slate-400 mb-3">
                  Avisos internos para o dono do espaço.
                </p>

                <div className="space-y-2">
                  <ToggleRow
                    label="Email: novo agendamento"
                    caption={
                      (isEditingNotifs ? draftNotifs : settings).emailNewBooking
                        ? "Ativo"
                        : "Desativado"
                    }
                    checked={
                      (isEditingNotifs ? draftNotifs : settings).emailNewBooking
                    }
                    disabled={!isEditingNotifs}
                    onChange={(v) =>
                      setDraftNotifs((p) =>
                        p ? { ...p, emailNewBooking: v } : p
                      )
                    }
                  />
                  <ToggleRow
                    label="Email: cancelamento"
                    caption={
                      (isEditingNotifs ? draftNotifs : settings)
                        .emailCancellation
                        ? "Ativo"
                        : "Desativado"
                    }
                    checked={
                      (isEditingNotifs ? draftNotifs : settings)
                        .emailCancellation
                    }
                    disabled={!isEditingNotifs}
                    onChange={(v) =>
                      setDraftNotifs((p) =>
                        p ? { ...p, emailCancellation: v } : p
                      )
                    }
                  />
                  <ToggleRow
                    label="Email: reagendamento"
                    caption={
                      (isEditingNotifs ? draftNotifs : settings).emailReschedule
                        ? "Ativo"
                        : "Desativado"
                    }
                    checked={
                      (isEditingNotifs ? draftNotifs : settings).emailReschedule
                    }
                    disabled={!isEditingNotifs}
                    onChange={(v) =>
                      setDraftNotifs((p) =>
                        p ? { ...p, emailReschedule: v } : p
                      )
                    }
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-slate-200 font-medium">Profissionais</p>
                <p className="text-[11px] text-slate-400 mb-3">
                  Notificações para quem executa o serviço.
                </p>

                <div className="space-y-2">
                  <ToggleRow
                    label="Avisar profissional: novo agendamento"
                    caption={
                      (isEditingNotifs ? draftNotifs : settings)
                        .notifyProvidersNewBooking
                        ? "Ativo"
                        : "Desativado"
                    }
                    checked={
                      (isEditingNotifs ? draftNotifs : settings)
                        .notifyProvidersNewBooking
                    }
                    disabled={!isEditingNotifs}
                    onChange={(v) =>
                      setDraftNotifs((p) =>
                        p ? { ...p, notifyProvidersNewBooking: v } : p
                      )
                    }
                  />
                  <ToggleRow
                    label="Avisar profissional: alterações/cancelamentos"
                    caption={
                      (isEditingNotifs ? draftNotifs : settings)
                        .notifyProvidersChanges
                        ? "Ativo"
                        : "Desativado"
                    }
                    checked={
                      (isEditingNotifs ? draftNotifs : settings)
                        .notifyProvidersChanges
                    }
                    disabled={!isEditingNotifs}
                    onChange={(v) =>
                      setDraftNotifs((p) =>
                        p ? { ...p, notifyProvidersChanges: v } : p
                      )
                    }
                  />
                </div>
              </div>

              <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-slate-200 font-medium">Cliente</p>
                <p className="text-[11px] text-slate-400 mb-3">
                  Lembretes automáticos (canal será definido depois).
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ToggleRow
                    label="Ativar lembretes ao cliente"
                    caption={
                      (isEditingNotifs ? draftNotifs : settings)
                        .clientRemindersEnabled
                        ? "Ativo"
                        : "Desativado"
                    }
                    checked={
                      (isEditingNotifs ? draftNotifs : settings)
                        .clientRemindersEnabled
                    }
                    disabled={!isEditingNotifs}
                    onChange={(v) =>
                      setDraftNotifs((p) =>
                        p ? { ...p, clientRemindersEnabled: v } : p
                      )
                    }
                  />

                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] text-slate-400">
                        Enviar lembrete (horas antes)
                      </p>
                      <p className="text-[11px] text-slate-300">
                        Define quantas horas antes do agendamento.
                      </p>
                    </div>

                    <input
                      type="number"
                      min={1}
                      max={168}
                      className="w-20 rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1 text-sm text-slate-100 outline-none disabled:opacity-60"
                      disabled={!isEditingNotifs}
                      value={
                        (isEditingNotifs ? draftNotifs : settings)
                          .reminderHoursBefore
                      }
                      onChange={(e) =>
                        setDraftNotifs((p) =>
                          p
                            ? {
                                ...p,
                                reminderHoursBefore: Number(e.target.value),
                              }
                            : p
                        )
                      }
                    />
                  </div>
                </div>

                <p className="mt-2 text-[10px] text-slate-500">
                  Próximo passo: escolher canal (email/SMS/WhatsApp) e ligar o
                  disparo real com jobs/cron.
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ====== BLOCO: Segurança (só abre se clicar) ====== */}
      {activeTab === "security" && (
        <section className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-200 font-medium">Segurança</p>
              <p className="text-[11px] text-slate-400">
                Ajustes de sessão e proteção de ações sensíveis (MVP).
              </p>
            </div>

            {!isEditingSecurity ? (
              <button
                onClick={startEditSecurity}
                className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-[11px]"
                disabled={!settings || isLoading}
              >
                Editar
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={cancelEditSecurity}
                  className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-[11px]"
                  disabled={isSavingSecurity}
                >
                  Cancelar
                </button>
                <button
                  onClick={saveSecurity}
                  className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200 text-[11px]"
                  disabled={isSavingSecurity}
                >
                  {isSavingSecurity ? "Salvando..." : "Salvar"}
                </button>
              </div>
            )}
          </div>

          {securityError && (
            <div className="mt-3 rounded-xl border border-rose-900/40 bg-rose-950/30 px-3 py-2 text-[11px] text-rose-200">
              {securityError}
            </div>
          )}

          {isLoading ? (
            <p className="mt-3 text-[11px] text-slate-400">Carregando...</p>
          ) : !settings ? (
            <p className="mt-3 text-[11px] text-slate-400">
              Sem dados de segurança.
            </p>
          ) : !isEditingSecurity ? (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <PrefItem
                label="Timeout ocioso (min)"
                value={`${settings.sessionIdleTimeoutMin} min`}
              />
              <PrefItem
                label="Reautenticar ações sensíveis"
                value={
                  settings.requireReauthForSensitiveActions
                    ? "Ativo"
                    : "Desativado"
                }
              />
              <PrefItem
                label="2FA"
                value={settings.twoFactorEnabled ? "Ativo" : "Desativado"}
              />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <FieldNumber
                label="Timeout ocioso (min)"
                value={draftSecurity?.sessionIdleTimeoutMin ?? 0}
                onChange={(n) =>
                  setDraftSecurity((p) =>
                    p ? { ...p, sessionIdleTimeoutMin: n } : p
                  )
                }
              />
              <FieldToggle
                label="Reautenticar ações sensíveis"
                checked={!!draftSecurity?.requireReauthForSensitiveActions}
                onChange={(checked) =>
                  setDraftSecurity((p) =>
                    p ? { ...p, requireReauthForSensitiveActions: checked } : p
                  )
                }
              />
              <FieldToggle
                label="2FA"
                checked={!!draftSecurity?.twoFactorEnabled}
                onChange={(checked) =>
                  setDraftSecurity((p) =>
                    p ? { ...p, twoFactorEnabled: checked } : p
                  )
                }
              />
            </div>
          )}
        </section>
      )}

      {/* Grid principal (sempre visível) */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Dados da marca */}
        <div className="xl:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Dados da marca</p>
            {!isEditingBrand ? (
              <button
                onClick={startEditBrand}
                className="text-[11px] text-emerald-400 hover:underline"
              >
                Editar
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={cancelEditBrand}
                  className="text-[11px] text-slate-300 hover:underline"
                  disabled={isSavingBrand}
                >
                  Cancelar
                </button>
                <button
                  onClick={saveBrand}
                  className="text-[11px] text-emerald-400 hover:underline"
                  disabled={isSavingBrand}
                >
                  {isSavingBrand ? "Salvando..." : "Salvar"}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[11px] text-slate-400">Nome legal</p>
              {!isEditingBrand ? (
                <p className="text-sm font-semibold">{tenant.legalName}</p>
              ) : (
                <input
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-sm text-slate-100 outline-none"
                  value={draftBrand?.legalName ?? ""}
                  onChange={(e) =>
                    setDraftBrand((p) =>
                      p ? { ...p, legalName: e.target.value } : p
                    )
                  }
                />
              )}
            </div>

            <div>
              <p className="text-[11px] text-slate-400">Nome da marca</p>
              {!isEditingBrand ? (
                <p className="text-sm font-semibold">{tenant.brandName}</p>
              ) : (
                <input
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-sm text-slate-100 outline-none"
                  value={draftBrand?.brandName ?? ""}
                  onChange={(e) =>
                    setDraftBrand((p) =>
                      p ? { ...p, brandName: e.target.value } : p
                    )
                  }
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-slate-400">Moeda padrão</p>
                <p className="text-sm font-semibold">
                  <button
                    type="button"
                    onClick={() => setActiveTab("prefs")}
                    className="mt-1 text-[10px] text-emerald-400 hover:underline"
                  >
                    Editado em “Preferências gerais”
                  </button>
                  {tenant.defaultCurrency}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">País</p>
                <p className="text-sm font-semibold">{tenant.country}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-slate-400">Timezone</p>
                <p className="text-sm font-semibold">{tenant.timezone}</p>
                <button
                  type="button"
                  onClick={() => setActiveTab("prefs")}
                  className="mt-1 text-[10px] text-emerald-400 hover:underline"
                >
                  Editado em “Preferências gerais”
                </button>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Telefone</p>
                <p className="text-sm font-semibold">{tenant.contactPhone}</p>
              </div>
            </div>

            <div>
              <p className="text-[11px] text-slate-400">Email de contacto</p>
              <p className="text-sm font-semibold">{tenant.contactEmail}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">NIF</p>

              {!isEditingBrand ? (
                <p className="text-sm font-semibold">{tenant.nif ?? "—"}</p>
              ) : (
                <input
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-sm text-slate-100 outline-none"
                  value={draftBrand?.nif ?? ""}
                  onChange={(e) =>
                    setDraftBrand((p) =>
                      p ? { ...p, nif: e.target.value } : p
                    )
                  }
                  placeholder="Ex: 123456789"
                />
              )}
            </div>

            <div>
              <p className="text-[11px] text-slate-400">Tenant ID</p>
              <p className="text-[11px] text-slate-300 font-mono">
                {tenant.tenantId ?? "—"}
              </p>
            </div>

            <p className="mt-2 text-[10px] text-slate-500">
              Nesta fase, “Nome legal” e “Nome da marca” ainda não vêm do
              backend (modelo Tenant ainda não expõe esses campos).
            </p>
          </div>
          {brandError && (
            <div className="mt-3 rounded-xl border border-rose-900/40 bg-rose-950/30 px-3 py-2 text-[11px] text-rose-200">
              {brandError}
            </div>
          )}
        </div>

        {/* Unidades */}
        <div className="xl:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Unidades</p>
            <Link
              href="/owner/unidades"
              className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200 text-[11px]"
            >
              + Adicionar unidade
            </Link>
          </div>

          {isLoading ? (
            <p className="text-[11px] text-slate-400">Carregando unidades...</p>
          ) : (
            <div className="space-y-2">
              {locations.map((loc) => (
                <div
                  key={loc.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-[11px] font-medium">{loc.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {loc.address ?? "—"}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Código: {loc.slug ?? "—"} · Horário:{" "}
                      {loc.businessHoursTemplate ? "configurado" : "—"}
                    </p>
                  </div>

                  <div className="text-right">
                    <span
                      className={[
                        "inline-block px-2 py-[1px] rounded-full text-[9px]",
                        loc.active
                          ? "bg-emerald-500/20 text-emerald-100"
                          : "bg-slate-700 text-slate-100",
                      ].join(" ")}
                    >
                      {loc.active ? "Ativa" : "Inativa"}
                    </span>

                    <Link
                      href={`/owner/unidades?locationId=${loc.id}`}
                      className="mt-2 inline-flex px-2 py-[2px] rounded text-[10px] border border-slate-700 text-slate-200 hover:border-emerald-500"
                    >
                      Gerir
                    </Link>
                  </div>
                </div>
              ))}

              {!locations.length && (
                <p className="text-[11px] text-slate-400">
                  Nenhuma unidade encontrada.
                </p>
              )}
            </div>
          )}

          <p className="mt-2 text-[10px] text-slate-500">
            Estas unidades mapeiam diretamente as{" "}
            <span className="font-mono text-[10px]">Locations</span> do backend.
          </p>
        </div>

        {/* Utilizadores */}
        <div className="xl:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Utilizadores & permissões</p>
            <button
              onClick={() => {
                setInviteError(null);
                setInviteUrl(null);
                setInviteOpen(true);
              }}
              className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200 text-[11px]"
            >
              + Convidar utilizador
            </button>
          </div>

          {isLoading ? (
            <p className="text-[11px] text-slate-400">
              Carregando utilizadores...
            </p>
          ) : (
            <div className="overflow-auto max-h-80 pr-1">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="text-slate-400">
                    <th className="text-left py-2 pr-3 border-b border-slate-800">
                      Nome
                    </th>
                    <th className="text-left py-2 pr-3 border-b border-slate-800">
                      Email
                    </th>
                    <th className="text-left py-2 pr-3 border-b border-slate-800">
                      Role
                    </th>
                    <th className="text-left py-2 pr-3 border-b border-slate-800">
                      Unidade
                    </th>
                    <th className="text-left py-2 pl-3 border-b border-slate-800">
                      Estado
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((user) => {
                    const role = normalizeRole(user.role);
                    const locationName =
                      user.locationId && locationNameById.has(user.locationId)
                        ? locationNameById.get(user.locationId)
                        : null;

                    return (
                      <tr key={user.id} className="hover:bg-slate-950/50">
                        <td className="py-2 pr-3 text-slate-200">
                          {user.name}
                        </td>
                        <td className="py-2 pr-3 text-slate-200">
                          {user.email}
                        </td>
                        <td className="py-2 pr-3">
                          <RoleBadge role={role} />
                        </td>
                        <td className="py-2 pr-3 text-slate-300">
                          {locationName ?? "—"}
                        </td>
                        <td className="py-2 pl-3">
                          <UserStatusBadge isActive={user.active} />
                        </td>
                      </tr>
                    );
                  })}

                  {!users.length && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-3 text-[11px] text-slate-400"
                      >
                        Nenhum utilizador encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-2 text-[10px] text-slate-500">
            Estes utilizadores correspondem à tabela{" "}
            <span className="font-mono text-[10px]">User</span>. A coluna
            “Unidade” só aparecerá quando o backend expor{" "}
            <span className="font-mono">locationId</span> no endpoint de
            listagem.
          </p>
        </div>
      </section>
      {inviteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-200 text-sm font-semibold">
                Convidar utilizador
              </p>
              <button
                className="text-slate-400 hover:text-slate-200 text-sm"
                onClick={() => setInviteOpen(false)}
              >
                ✕
              </button>
            </div>

            {inviteError ? (
              <div className="mb-3 rounded-xl border border-red-800 bg-red-900/20 p-3">
                <p className="text-red-200 text-xs">{inviteError}</p>
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Role
                </label>
                <select
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm"
                  value={inviteForm.role}
                  onChange={(e) =>
                    setInviteForm((s) => ({
                      ...s,
                      role: e.target.value as any,
                    }))
                  }
                >
                  <option value="provider">provider</option>
                  <option value="attendant">attendant</option>
                  <option value="admin">admin</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Unidade
                </label>
                <select
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm"
                  value={inviteForm.locationId ?? ""}
                  onChange={(e) =>
                    setInviteForm((s) => ({
                      ...s,
                      locationId: e.target.value || undefined,
                    }))
                  }
                >
                  <option value="">(Opcional)</option>
                  {locationOptions.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              {inviteForm.role === "provider" ? (
                <div className="md:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Especialidade
                  </label>
                  <select
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm"
                    value={inviteForm.specialty ?? "barber"}
                    onChange={(e) =>
                      setInviteForm((s) => ({
                        ...s,
                        specialty: e.target.value as any,
                      }))
                    }
                  >
                    <option value="barber">barber</option>
                    <option value="hairdresser">hairdresser</option>
                    <option value="nail">nail</option>
                    <option value="esthetic">esthetic</option>
                    <option value="makeup">makeup</option>
                    <option value="tattoo">tattoo</option>
                    <option value="other">other</option>
                  </select>
                </div>
              ) : null}

              <div className="md:col-span-2">
                <label className="block text-[11px] text-slate-400 mb-1">
                  Expira em (horas)
                </label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm"
                  value={inviteForm.expiresInHours ?? 72}
                  onChange={(e) =>
                    setInviteForm((s) => ({
                      ...s,
                      expiresInHours: Number(e.target.value || 72),
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setInviteOpen(false)}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-900/30 px-3 py-2 text-sm text-slate-200"
              >
                Cancelar
              </button>

              <button
                disabled={inviteLoading}
                onClick={async () => {
                  try {
                    setInviteLoading(true);
                    setInviteError(null);
                    setInviteUrl(null);

                    const payload: CreateInviteInput = {
                      role: inviteForm.role,
                      specialty:
                        inviteForm.role === "provider"
                          ? inviteForm.specialty
                          : undefined,
                      locationId: inviteForm.locationId,
                      expiresInHours: inviteForm.expiresInHours,
                    };

                    const res = await createOwnerInvite(payload);
                    setInviteUrl(res.inviteUrl);
                  } catch (e) {
                    const msg =
                      e instanceof ApiError
                        ? e.message
                        : "Falha ao criar convite.";
                    setInviteError(msg);
                  } finally {
                    setInviteLoading(false);
                  }
                }}
                className="flex-1 rounded-xl border border-emerald-600 bg-emerald-600/20 px-3 py-2 text-sm text-emerald-200 disabled:opacity-50"
              >
                {inviteLoading ? "Gerando..." : "Gerar link"}
              </button>
            </div>

            {inviteUrl ? (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-[11px] text-slate-400 mb-2">
                  Link do convite
                </p>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px]"
                    value={inviteUrl}
                    readOnly
                  />
                  <button
                    className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-200"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteUrl);
                      } catch {}
                    }}
                  >
                    Copiar
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  Envia esse link pra pessoa. Ela abre, cria senha e entra.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* =========================
          MODAL REAUTH
         ========================= */}
      {reauthOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={cancelReauth}
          />
          <div className="relative w-[92%] max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-5 text-xs shadow-xl">
            <p className="text-slate-100 text-sm font-semibold">
              Reautenticação necessária
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Para salvar esta alteração, confirme sua senha.
            </p>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <p className="text-[10px] text-slate-400">Senha</p>
              <input
                type="password"
                className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-2 text-sm text-slate-100 outline-none"
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
                placeholder="Digite sua senha"
                autoFocus
              />
              {reauthError && (
                <div className="mt-3 rounded-xl border border-rose-900/40 bg-rose-950/30 px-3 py-2 text-[11px] text-rose-200">
                  {reauthError}
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={cancelReauth}
                className="px-3 py-2 rounded-lg border border-slate-800 bg-slate-900/80 text-[11px] text-slate-200"
                disabled={reauthLoading}
              >
                Cancelar
              </button>
              <button
                onClick={confirmReauth}
                className="px-3 py-2 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200 text-[11px]"
                disabled={reauthLoading}
              >
                {reauthLoading ? "Confirmando..." : "Confirmar"}
              </button>
            </div>

            <p className="mt-3 text-[10px] text-slate-500">
              Nota: por segurança, essa reautenticação pode ser solicitada de
              novo em ações sensíveis seguintes (token one-time).
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------- UI Components ----------------

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-3 py-1 rounded-lg border text-xs",
        active
          ? "border-emerald-600 bg-emerald-600/20 text-emerald-200"
          : "border-slate-800 bg-slate-900/80 text-slate-200",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  const base = "inline-block px-2 py-[1px] rounded-full text-[9px]";
  switch (role) {
    case "owner":
      return (
        <span className={`${base} bg-emerald-500/20 text-emerald-100`}>
          Owner
        </span>
      );
    case "admin":
      return (
        <span className={`${base} bg-sky-500/20 text-sky-100`}>Admin</span>
      );
    case "attendant":
      return (
        <span className={`${base} bg-indigo-500/20 text-indigo-100`}>
          Recepção
        </span>
      );
    case "provider":
      return (
        <span className={`${base} bg-slate-700 text-slate-100`}>
          Profissional
        </span>
      );
    default:
      return <span className={`${base} bg-slate-700 text-slate-100`}>—</span>;
  }
}

function UserStatusBadge({ isActive }: { isActive: boolean }) {
  const base = "inline-block px-2 py-[1px] rounded-full text-[9px]";
  return isActive ? (
    <span className={`${base} bg-emerald-500/20 text-emerald-100`}>Ativo</span>
  ) : (
    <span className={`${base} bg-slate-700 text-slate-100`}>Inativo</span>
  );
}

function PrefItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function ToggleRow({
  label,
  caption,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  caption: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 flex items-center justify-between gap-3">
      <div>
        <p className="text-[11px] font-medium text-slate-200">{label}</p>
        <p className="text-[10px] text-slate-400">{caption}</p>
      </div>

      <input
        type="checkbox"
        className="h-4 w-4 accent-emerald-500 disabled:opacity-60"
        disabled={disabled}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

function FieldText({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <p className="text-[10px] text-slate-400">{label}</p>
      <input
        className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1 text-sm text-slate-100 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function FieldTimezoneSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((tz) => tz.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) return;

    // 1) se bater exatamente com algum timezone, seleciona
    const exact = options.find((tz) => tz.toLowerCase() === q);
    if (exact && exact !== value) {
      onChange(exact);
      return;
    }

    // 2) se só sobrar 1 opção filtrada, seleciona automaticamente
    if (filtered.length === 1 && filtered[0] !== value) {
      onChange(filtered[0]);
      return;
    }

    // 3) se o valor atual não estiver no filtro, seleciona o 1º do filtro
    if (filtered.length > 0 && !filtered.includes(value)) {
      onChange(filtered[0]);
    }
  }, [query, options, filtered, value, onChange]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <p className="text-[10px] text-slate-400">{label}</p>

      {/* Busca */}
      <input
        className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1 text-sm text-slate-100 outline-none"
        placeholder="Pesquisar… (ex: Lisbon, Madrid, Sao_Paulo)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {/* Lista */}
      <select
        className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1 text-sm text-slate-100 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {filtered.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>

      <p className="mt-2 text-[10px] text-slate-500">
        Digite para filtrar e selecione um timezone válido (IANA).
      </p>
    </div>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <p className="text-[10px] text-slate-400">{label}</p>
      <input
        type="number"
        className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1 text-sm text-slate-100 outline-none"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function FieldDateFormatSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <p className="text-[10px] text-slate-400">{label}</p>

      <select
        className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1 text-sm text-slate-100 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((fmt) => (
          <option key={fmt} value={fmt}>
            {fmt}
          </option>
        ))}
      </select>

      <p className="mt-2 text-[10px] text-slate-500">
        Exemplo:{" "}
        <span className="font-mono">
          {value === "dd/MM/yyyy"
            ? "23/12/2025"
            : value === "MM/dd/yyyy"
            ? "12/23/2025"
            : "2025-12-23"}
        </span>
      </p>
    </div>
  );
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (n: number) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <p className="text-[10px] text-slate-400">{label}</p>

      <select
        className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1 text-sm text-slate-100 outline-none"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt} min
          </option>
        ))}
      </select>
    </div>
  );
}
function FieldCurrencySelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <p className="text-[10px] text-slate-400">{label}</p>

      <select
        className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1 text-sm text-slate-100 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}

function FieldToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 flex items-center justify-between">
      <div>
        <p className="text-[10px] text-slate-400">{label}</p>
        <p className="mt-1 text-sm font-semibold text-slate-100">
          {checked ? "Ativo" : "Desativado"}
        </p>
      </div>
      <input
        type="checkbox"
        className="h-4 w-4 accent-emerald-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}
