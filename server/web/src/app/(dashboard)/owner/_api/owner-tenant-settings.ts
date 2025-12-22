// server/web/src/app/(dashboard)/owner/_api/owner-tenant-settings.ts
import { apiClient } from "@/lib/api-client";

export type TenantSettings = {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;

  // Preferências gerais
  timezone: string;
  defaultCurrency: string; // "EUR"
  dateFormat: string; // ex: "dd/MM/yyyy"
  use24hClock: boolean;

  // Agenda
  defaultAppointmentDurationMin: number;
  bufferBetweenAppointmentsMin: number;
  allowOverbooking: boolean;
  bookingIntervalMin: number;
  minCancelNoticeHours: number;

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

  // No-show / Pagamento (extras que já tinhas)
  autoNoShowEnabled: boolean;
  noShowAfterMin: number | null;
  defaultPaymentMethod: string; // ex: "cash"
};

export type UpdateTenantSettingsInput = Partial<
  Pick<
    TenantSettings,
    | "timezone"
    | "defaultCurrency"
    | "dateFormat"
    | "use24hClock"
    | "defaultAppointmentDurationMin"
    | "bufferBetweenAppointmentsMin"
    | "allowOverbooking"
    | "bookingIntervalMin"
    | "minCancelNoticeHours"
    | "emailNewBooking"
    | "emailCancellation"
    | "emailReschedule"
    | "notifyProvidersNewBooking"
    | "notifyProvidersChanges"
    | "clientRemindersEnabled"
    | "reminderHoursBefore"
    | "sessionIdleTimeoutMin"
    | "requireReauthForSensitiveActions"
    | "twoFactorEnabled"
    | "autoNoShowEnabled"
    | "noShowAfterMin"
    | "defaultPaymentMethod"
  >
>;

export async function fetchOwnerTenantSettings(): Promise<TenantSettings> {
  return apiClient<TenantSettings>("/tenants/settings", { method: "GET" });
}

export async function updateOwnerTenantSettings(
  dto: UpdateTenantSettingsInput
): Promise<TenantSettings> {
  return apiClient<TenantSettings>("/tenants/settings", {
    method: "PATCH",
    body: dto,
  });
}
